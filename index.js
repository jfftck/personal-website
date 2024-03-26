'use strict'

// import { GalleryDetails, PhotoDetails, gallery } from './gallery';

document.body.onload = () => {
    requestAnimationFrame(() => {
        document.body.classList.add('loaded')
        setTimeout(() => {
            document.body.classList.remove('curtian')
        }, 2000)
    })
}