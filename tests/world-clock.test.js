'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cityZoneReference = require('./fixtures/world-clock-city-zones.json');

let CITY_OPTIONS, createCityLookup, findCitySuggestions, normalizeCity, resolveCity;
test.before(async () => {
  ({ CITY_OPTIONS, createCityLookup, findCitySuggestions, normalizeCity, resolveCity } = await import(
    '../artifacts/personal-website/public/apps/world-clock.js'
  ));
});

function canonicalIanaZone(zone) {
  let current = zone;
  const visited = new Set();
  while (cityZoneReference.ianaZoneAliases[current]) {
    assert.ok(!visited.has(current), `IANA zone aliases contain a cycle at ${current}`);
    visited.add(current);
    current = cityZoneReference.ianaZoneAliases[current];
  }
  return current;
}

test('every city and alias resolves to its reference-backed geographic time zone', () => {
  for (const { city, country, zone, aliases = [] } of CITY_OPTIONS) {
    assert.doesNotThrow(
      () => new Intl.DateTimeFormat('en', { timeZone: zone }),
      `${city} has unsupported time zone ${zone}`,
    );
    const reference = cityZoneReference.cities.find(
      item => item.city === city && item.country === country,
    );
    assert.ok(reference, `${city} is missing from the pinned geographic reference`);
    assert.equal(
      canonicalIanaZone(zone),
      canonicalIanaZone(reference.expectedZone),
      `${city} (${reference.country}, GeoNames ${reference.geonameId}) should use ${reference.expectedZone}, not ${zone}`,
    );

    for (const name of [city, ...aliases]) {
      assert.equal(
        canonicalIanaZone(resolveCity(name)?.zone),
        canonicalIanaZone(reference.expectedZone),
        `${JSON.stringify(name)} should resolve to ${reference.expectedZone} for ${city}`,
      );
    }
  }
});

test('the pinned geographic reference covers the catalog exactly and records source exceptions', () => {
  assert.match(cityZoneReference.source.geonamesUrl, /^https:\/\//);
  assert.match(cityZoneReference.source.ianaResolverUrl, /^https:\/\//);
  assert.match(cityZoneReference.source.ianaTzdbVersion, /^\d{4}[a-z]$/);

  const catalogKeys = new Set(CITY_OPTIONS.map(({ city, country }) => `${city}\u0000${country}`));
  const referenceKeys = new Set();
  const geonameIds = new Set();
  for (const item of cityZoneReference.cities) {
    const key = `${item.city}\u0000${item.country}`;
    assert.ok(!referenceKeys.has(key), `duplicate reference entry for ${item.city}, ${item.country}`);
    assert.ok(!geonameIds.has(item.geonameId), `duplicate GeoNames record ${item.geonameId}`);
    assert.ok(item.countryCode, `${item.city} is missing its GeoNames country code`);
    assert.ok(item.geonamesCity, `${item.city} is missing its GeoNames place name`);
    referenceKeys.add(key);
    geonameIds.add(item.geonameId);
  }
  assert.deepEqual(
    [...referenceKeys].sort(),
    [...catalogKeys].sort(),
    'reference changes must explicitly cover the full curated city catalog',
  );

  const overridesById = new Map(cityZoneReference.referenceOverrides.map(item => [item.geonameId, item]));
  for (const item of cityZoneReference.cities) {
    if (item.geonamesZone === item.expectedZone) {
      assert.ok(!overridesById.has(item.geonameId), `${item.city} has an unnecessary reference override`);
      continue;
    }
    const override = overridesById.get(item.geonameId);
    assert.ok(override, `${item.city} has an undocumented GeoNames/IANA zone difference`);
    assert.equal(override.city, item.city);
    assert.equal(override.sourceZone, item.geonamesZone);
    assert.equal(override.expectedZone, item.expectedZone);
    assert.ok(override.reason, `${item.city} reference override needs a review note`);
  }
  assert.equal(
    overridesById.size,
    cityZoneReference.cities.filter(item => item.geonamesZone !== item.expectedZone).length,
    'reference override list contains an entry not tied to a source mismatch',
  );
});

test('normalized city names never point to conflicting time zones', () => {
  const zonesByName = new Map();

  for (const { city, zone, aliases = [] } of CITY_OPTIONS) {
    for (const name of [city, ...aliases]) {
      const key = normalizeCity(name);
      const previousZone = zonesByName.get(key);
      assert.ok(
        previousZone === undefined || previousZone === zone,
        `${JSON.stringify(name)} normalizes to "${key}", already assigned to ${previousZone} instead of ${zone}`,
      );
      zonesByName.set(key, zone);
    }
  }
});

test('city lookup rejects names that normalize to different time zones', () => {
  assert.throws(
    () => createCityLookup([
      { city: 'New-York', zone: 'America/New_York' },
      { city: 'New York', zone: 'Europe/London' },
    ]),
    /Conflicting time zones for normalized city name "newyork": America\/New_York and Europe\/London/,
  );
});

test('city search ignores spacing and punctuation variants', () => {
  for (const [name, zone] of [
    ['New   York', 'America/New_York'],
    ['New-York', 'America/New_York'],
    ['New.York', 'America/New_York'],
    ['Ho-Chi Minh City', 'Asia/Ho_Chi_Minh'],
    ['Ho  Chi Minh City', 'Asia/Ho_Chi_Minh'],
    ['Sao-Paulo', 'America/Sao_Paulo'],
    ['San Jose', 'America/Costa_Rica'],
    ['San-José', 'America/Costa_Rica'],
    ['Alma Ata', 'Asia/Almaty'],
  ]) {
    assert.equal(resolveCity(name)?.zone, zone, `${JSON.stringify(name)} should resolve to ${zone}`);
  }
});

test('diacritic-insensitive and alternate city names resolve to their expected zones', () => {
  for (const [name, zone] of [
    ['Bogotá', 'America/Bogota'],
    ['Bogota', 'America/Bogota'],
    ['SÃO PAULO', 'America/Sao_Paulo'],
    ['Sao Paulo', 'America/Sao_Paulo'],
    ['München', 'Europe/Berlin'],
    ['MUNCHEN', 'Europe/Berlin'],
    ['Bangalore', 'Asia/Kolkata'],
    ['Saigon', 'Asia/Ho_Chi_Minh'],
    ['Sài Gòn', 'Asia/Ho_Chi_Minh'],
    ['Kiev', 'Europe/Kyiv'],
  ]) {
    assert.equal(resolveCity(name)?.zone, zone, `${JSON.stringify(name)} should resolve to ${zone}`);
  }
});

test('city typo suggestions stay close, rank likely matches, and leave exact aliases alone', () => {
  assert.deepEqual(findCitySuggestions('Pariss').map(({ city, country, zone }) => ({ city, country, zone })), [
    { city: 'Paris', country: 'France', zone: 'Europe/Paris' },
  ]);
  assert.equal(findCitySuggestions('Bangaluru')[0]?.city, 'Bengaluru');
  assert.deepEqual(findCitySuggestions('Sao Paulo'), []);
  assert.deepEqual(findCitySuggestions('Atlantis'), []);
});
