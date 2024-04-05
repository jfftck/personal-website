'use strict'

//import { GalleryDetails, PhotoDetails, gallery } from './gallery';

document.body.onload = () => {
    requestAnimationFrame(() => {
        document.body.classList.add('loaded')
        setTimeout(() => {
            document.body.classList.remove('curtian')
        }, 2000)
    })

    document.body.addEventListener("click", () => {
        if (document.body.classList.contains("blur")) {
            document.body.focus()
            document.body.classList.remove("blur")
        }
    })
}