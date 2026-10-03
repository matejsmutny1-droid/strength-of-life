// Mobilné menu
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');

if (hamburger && navMenu) {
    const setMenuOpen = (isOpen) => {
        hamburger.classList.toggle('open', isOpen);
        navMenu.classList.toggle('active', isOpen);
        hamburger.setAttribute('aria-expanded', String(isOpen));
        document.body.classList.toggle('no-scroll', isOpen);
    };

    hamburger.setAttribute('aria-controls', navMenu.id);
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', () => {
        setMenuOpen(!navMenu.classList.contains('active'));
    });
    navMenu.addEventListener('click', (event) => {
        if (event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && navMenu.classList.contains('active')) {
            setMenuOpen(false);
            hamburger.focus();
        }
    });
}

// Auto-skrytie hlavičky pri scrollovaní nadol
let lastScroll = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll <= 0) {
        header.classList.remove('hide');
        lastScroll = currentScroll;
        return;
    }

    if (document.body.classList.contains('no-scroll')) return;

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
