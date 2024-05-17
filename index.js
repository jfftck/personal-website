'use strict'
//import { GalleryDetails, PhotoDetails, gallery } from './gallery';

const aniEnd = (e) => {
    if (e.animationName === 'curtian') {
        document.body.classList.remove('curtian');
        document.body.removeEventListener('animationend', aniEnd);
    }
};

const themeSelectorButton = (e) => {
    e.stopPropagation();
}

document.body.addEventListener("click", () => {
    const shouldBlur = document.activeElement.getAttribute(
        "data-blur") === "true";

    if (shouldBlur) {
        document.body.focus();
        console.log(`blurring: ${document.activeElement.nodeName}`)
    }
});

document.body.onload = () => {
    requestAnimationFrame(() => {
        document.body.classList.add('loaded');
        document.body.addEventListener("animationend", aniEnd);
    })

    document.querySelectorAll("input[name='color']").forEach(e => e.addEventListener("click", themeSelectorButton))
};