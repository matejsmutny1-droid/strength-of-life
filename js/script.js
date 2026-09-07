// Hamburger Menu Toggle
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navMenu.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
});

// Auto-skrytie hlavičky pri scrollovaní nadol
let lastScroll = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll <= 0) {
        header.classList.remove('hide');
        return;
    }

    if (currentScroll > lastScroll && !header.classList.contains('hide')) {
        // Scroll nadol - skryť hlavičku
        header.classList.add('hide');
    } else if (currentScroll < lastScroll && header.classList.contains('hide')) {
        // Scroll nahor - zobraziť hlavičku
        header.classList.remove('hide');
    }

    lastScroll = currentScroll;
});
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('servicesSlider');
    const prevBtn = document.getElementById('slidePrev');
    const nextBtn = document.getElementById('slideNext');

    if (slider && prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            slider.scrollBy({ left: -410, behavior: 'smooth' });
        });

        nextBtn.addEventListener('click', () => {
            slider.scrollBy({ left: 410, behavior: 'smooth' });
        });
    }
});