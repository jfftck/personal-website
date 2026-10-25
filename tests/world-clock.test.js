'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let CITY_OPTIONS, normalizeCity, resolveCity;
test.before(async () => {
  ({ CITY_OPTIONS, normalizeCity, resolveCity } = await import(
    '../artifacts/personal-website/public/apps/world-clock.js'
  ));
});

test('every city and alias resolves to a supported time zone', () => {
  for (const { city, zone, aliases = [] } of CITY_OPTIONS) {
    assert.doesNotThrow(
      () => new Intl.DateTimeFormat('en', { timeZone: zone }),
      `${city} has unsupported time zone ${zone}`,
    );

    for (const name of [city, ...aliases]) {
      assert.equal(
        resolveCity(name)?.zone,
        zone,
        `${JSON.stringify(name)} should resolve to ${zone}`,
      );
    }
  }
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
