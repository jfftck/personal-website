'use strict'
//import { GalleryDetails, PhotoDetails, gallery } from './gallery';

const aniEnd = (e) => {
    if (e.animationName === 'curtian') {
        document.body.classList.remove('curtian');
        document.body.removeEventListener('animationend', aniEnd);
    }
};

document.body.addEventListener("click", () => {
    if (document.body.classList.contains("blur")) {
        document.body.focus();
        document.body.classList.remove("blur");
    }
});

document.body.onload = () => {
    requestAnimationFrame(() => {
        document.body.classList.add('loaded');
        document.body.addEventListener("animationend", aniEnd);
    })
};