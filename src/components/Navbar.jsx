/**
 * Spidey – Navbar Component
 */

import { useState, useEffect } from 'react';

const NAV_LINKS = [
  { href: '#home',    label: 'Home'    },
  { href: '#powers',  label: 'Powers'  },
  { href: '#history', label: 'History' },
  { href: '#allies',  label: 'Allies'  },
];

export default function Navbar() {
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [activeHash, setActiveHash] = useState('#home');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sections = document.querySelectorAll('section[id]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHash(`#${entry.target.id}`);
          }
        });
      },
      { threshold: 0.4 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const handleNavClick = (href) => {
    setActiveHash(href);
    setMenuOpen(false);
    const target = document.querySelector(href);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`} role="navigation" aria-label="Main navigation">
      <div className="container">
        <div className="navbar__inner">
          {/* Logo */}
          <a
            href="#home"
            className="navbar__logo"
            onClick={(e) => { e.preventDefault(); handleNavClick('#home'); }}
            aria-label="Spidey – Go to home"
          >
            <img src="/favicon.png" alt="Spidey Logo" className="navbar__logo-icon" />
            <span className="navbar__logo-text">SPIDEY</span>
          </a>

          {/* Desktop links */}
          <ul className="navbar__links" role="list">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  className={activeHash === href ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); handleNavClick(href); }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>

          {/* CTA + Hamburger */}
          <button
            id="navbar-cta"
            className="btn btn-primary navbar__cta"
            onClick={() => handleNavClick('#allies')}
          >
            Join Force
          </button>

          <button
            id="navbar-hamburger"
            className={`navbar__hamburger${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen((p) => !p)}
            aria-expanded={menuOpen}
            aria-label="Toggle mobile menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {/* Mobile menu */}
        <div className={`navbar__mobile${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className={activeHash === href ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); handleNavClick(href); }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
