import { r, t, w } from 'https://cdn.skypack.dev/@arrow-js/core';

import { classes } from 'utils.js';


export const PhotoDetails = (uri, description) => Object.freeze({
    uri: uri,
    description: description,
    photoData: r({ state: PhotoStates.placeholder }),
});

export const GalleryDetails = (thumbnailPhotoDetails, photoDetails, name) => Object.freeze({
    thumbnailPhotoDetails: thumbnailPhotoDetails,
    photoDetails: photoDetails,
    name: name,
})

const PhotoStates = Object.freeze({
    placeholder,
    loaded,
    failed,
});

const img = (photoDetails) => t`
<img src="${() => photoDetails.uri}" alt="${() => photoDetails.description}" @load="${() => photoDetails.photoData.state = PhotoStates.loaded}" @error="${() => photoDetails.photoData.state = PhotoStates.failed}">
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
            case PhotoStates.loaded:
                return image;
            case PhotoStates.placeholder:
                return placeholder(photoDetails);
            case PhotoStates.failed:
            default:
                return placeholder(photoDetails, 'failed');
        }
    });
};

export const gallery = (...galleryDetails) => {
    var galleryItems = galleryDetails.map(g => {
        const photoDetails = g.thumbnailPhotoDetails;
        const galleryData = r({
            photo: placeholder(photoDetails)
        });

        w(() => {
            if (photoDetails.photoData.state == PhotoStates.loaded) {
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
    });

    return t`
    <section class="gallery">
        <h2>${g.name}</h2>
        ${galleryItems}
    </section>
    `;
};