/**
 * Spidey – Footer Component
 */

const FOOTER_LINKS = {
  'The Universe': [
    { label: 'Origin Story', href: '#history' },
    { label: 'Powers',       href: '#powers'  },
    { label: 'Allies',       href: '#allies'  },
  ],
  'Quick Links': [
    { label: 'Home',         href: '#home'    },
    { label: 'Join Forces',  href: '#allies'  },
  ],
};

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <div className="footer__grid">
          {/* Brand */}
          <div>
            <div className="footer__brand-logo" aria-label="Spidey">SPIDEY</div>
            <p className="footer__brand-desc">
              With great power comes great responsibility.
              Your friendly neighbourhood hero, swinging through the city
              one web at a time.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h3 className="footer__col-title">{title}</h3>
              <ul className="footer__links" role="list">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a href={href}>{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer__bottom">
          <p className="footer__copy">
            &copy; {year} Spidey. All rights reserved.
          </p>
          <span className="footer__tagline">
            🕷️ &nbsp; Your Friendly Neighbourhood Hero
          </span>
        </div>
      </div>
    </footer>
  );
}
