import { r, t, w } from 'https://cdn.skypack.dev/@arrow-js/core';

import { classes } from './css_classes.js';

/**
 * @typedef {(template: string[], ...values: any[]) => (el: HTMLElement) => void} ArrowTemplate
 */

/**
 * @typedef {Readonly<{thumbnailUri: string, uri: string, description: string, photoProps: {state: PhotoStates}}>} PhotoDetails
 */

/**https://replit.com/@jfftck/personal
 * @exports
 * @type {(uri: string, description: string) => PhotoDetails}
 */
export const createPhotoDetails = (thumbnailUri, uri, description) => Object.freeze({
    thumbnailUri,
    uri,
    description,
    photoProps: r({ state: PhotoStates.PLACEHOLDER }),
});

/**
 * @typedef {Readonly<{body: string, documentProps: {state: DocumentStates}}>} DocumentDetails
 */

/**
 * @exports
 * @type {(body: string) => DocumentDetails}
 */
export const createDocumentDetails = (body) => Object.freeze({
    body,
    documentProps: r({ state: DocumentStates.placeholder }),
});

/**
 * @exports
 * @type {(galleryItemDetails: PhotoDetails | DocumentDetails, title: string) => Readonly<HTMLElement>}
 */
export const GalleryDetails = (galleryItemDetails, title) => Object.freeze({
    galleryItemDetails,
    title,
});

/**
 * @type {Readonly<{PLACEHOLDER: 0, LOADED: 1, FAILED: 2}>}
 */
const PhotoStates = Object.freeze({
    PLACEHOLDER: 0,
    LOADED: 1,
    FAILED: 2,
});

/**
 * @type {Readonly<{UNREAD: 0, READ: 1}>}
 */
const DocumentStates = Object.freeze({
    UNREAD: 0,
    READ: 1,
});

/**
 * @type {(photoDetails: PhotoDetails) => ArrowTemplate}
 */
const galleryImage = (photoDetails) => {
    const galleryData = r({
        photo: placeholder(photoDetails.thumbnailUri)
    });

    w(() => {
        if (photoDetails.photoProps.state == PhotoStates.LOADED) {
            galleryData.photo = createPhoto(g.photoDetails);
        }
    });

    return t`
    <div class="gallery-item">
        <div class="gallery-thumbnail">
           ${createPhoto(photoDetails)}
        </div>
        <div class="gallery-photo">
           ${galleryData.photo}
        </div>
    </div>
    `;
}

const thumbnail = (uri) => t`
<img src="${uri}" alt="thumbnail" class="" />
`;

const img = (photoDetails) => t`
<img src="${() => photoDetails.uri}" alt="${() => photoDetails.description}" @load="${() => photoDetails.photoData.state = PhotoStates.LOADED}" @error="${() => photoDetails.photoData.state = PhotoStates.FAILED}">
`;

const placeholder = (photoDetails, ...cssClasses) => t`
<div class="${classes('img-placeholder', ...cssClasses)}">
    ${() => photoDetails.description}
</div>
`;

export const createPhoto = (photoDetails) => {
    const image = img(photoDetails);

    return w(() => {
        switch (photoDetails.photoData.state) {
            case PhotoStates.LOADED:
                return image;
            case PhotoStates.PLACEHOLDER:
                return placeholder(photoDetails);
            case PhotoStates.FAILED:
            default:
                return placeholder(photoDetails, 'failed');
        }
    });
};

/**
 * @exports
 * @type {(category: string, galleryDetails: GalleryDetails[]) => ArrowTemplate}
 */
export const gallery = (category, ...galleryDetails) => {
    var galleryItems = galleryDetails.map(({galleryItemDetails}) => {
        if (galleryItemDetails.photoProps != null) {
            return galleryImage(galleryItemDetails);
        } else if (galleryItemDetails.documentProps != null) {
            return galleryDocument(galleryItemDetails);
        }
    });

    return t`
    <section class="gallery">
        <h2>${category}</h2>
        ${galleryItems}
    </section>
    `;
};