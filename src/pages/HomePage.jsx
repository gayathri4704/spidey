/**
 * Spidey – Home Page
 * Hero section with badge, title, CTA buttons, and decorative web
 */

import { useEffect, useRef } from 'react';

export default function HomePage() {
  const heroRef = useRef(null);

  /* Parallax on hero decoration */
  useEffect(() => {
    const deco = heroRef.current?.querySelector('.hero__spider-decoration');
    if (!deco) return;

    const onMove = (e) => {
      const { clientX, clientY } = e;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (clientX - cx) / cx;
      const dy = (clientY - cy) / cy;
      deco.style.transform = `translateY(-50%) translate(${dx * 20}px, ${dy * 10}px)`;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <section id="home" className="hero-section web-pattern" ref={heroRef} aria-label="Hero section">
      {/* Glowing orbs */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: '10%', left: '-10%',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(192,57,43,0.1) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        }}
      />

      <div className="container">
        <div className="hero__content">
          {/* Badge */}
          <div className="hero__badge">
            <span className="badge badge-red">🕷️ &nbsp;Your Friendly Neighbourhood Hero</span>
          </div>

          {/* Title */}
          <h1 className="hero__title" id="hero-heading">
            AMAZING
            <span>SPIDEY</span>
          </h1>

          {/* Subtitle */}
          <p className="hero__subtitle">
            Bitten by a radioactive spider. Blessed with extraordinary power.
            Driven by responsibility. The city never sleeps — and neither does he.
          </p>

          {/* Actions */}
          <div className="hero__actions">
            <button
              id="hero-discover-btn"
              className="btn btn-primary"
              onClick={() => document.querySelector('#powers')?.scrollIntoView({ behavior: 'smooth' })}
            >
              🕸️ &nbsp;Discover Powers
            </button>
            <button
              id="hero-story-btn"
              className="btn btn-secondary"
              onClick={() => document.querySelector('#history')?.scrollIntoView({ behavior: 'smooth' })}
            >
              📖 &nbsp;Origin Story
            </button>
          </div>
        </div>
      </div>

      {/* Spider decoration */}
      <div className="hero__spider-decoration" aria-hidden="true">🕷️</div>

      {/* Scroll hint */}
      <div className="hero__scroll-hint" aria-hidden="true">
        <div className="hero__scroll-line" />
        <span>Scroll</span>
      </div>
    </section>
  );
}
