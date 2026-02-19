// src/pages/public/HomePage.jsx
import Navbar from "../../components/Navbar";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import logo from "../../assets/logo.png";
import "./HomePage.css";

// Philippine Time Clock Component
function PhilippineTimeClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const philippineTime = new Date(time.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  
  const hours = philippineTime.getHours();
  const minutes = philippineTime.getMinutes();
  const seconds = philippineTime.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayName = days[philippineTime.getDay()];
  const monthName = months[philippineTime.getMonth()];
  const date = philippineTime.getDate();
  const year = philippineTime.getFullYear();

  return (
    <div className="clock-widget">
      <div className="clock-header">
        <i className="fas fa-clock clock-icon"></i>
        <span className="clock-title">PHILIPPINE STANDARD TIME</span>
      </div>
      
      <div className="clock-time">
        {hour12.toString().padStart(2, '0')}:
        {minutes.toString().padStart(2, '0')}:
        {seconds.toString().padStart(2, '0')} {ampm}
      </div>
      
      <div className="clock-date">
        {dayName}, {monthName} {date}, {year}
      </div>
      
      <div className="clock-timezone">
        <i className="fas fa-globe-asia"></i>
        <span>Asia/Manila (UTC+8)</span>
      </div>
    </div>
  );
}

// Floating Water Droplets Background Component
function FloatingDroplets() {
  const droplets = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 20}s`,
    fontSize: `${Math.random() * 2 + 1}rem`,
    opacity: Math.random() * 0.1
  }));

  return (
    <div className="floating-droplets">
      {droplets.map(drop => (
        <i 
          key={drop.id}
          className="fas fa-tint"
          style={{
            left: drop.left,
            animationDelay: drop.animationDelay,
            fontSize: drop.fontSize,
            opacity: drop.opacity
          }}
        ></i>
      ))}
    </div>
  );
}

// Water Gallery Component
function WaterGallery() {
  const images = [
    {
      url: "https://images.unsplash.com/photo-1518186285589-2f7649de83e0",
      title: "Clean Water",
      description: "Providing clean water to communities"
    },
    {
      url: "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d",
      title: "Water Conservation",
      description: "Preserving our water resources"
    },
    {
      url: "https://images.unsplash.com/photo-1538300342682-cf57afb97285",
      title: "Community Wells",
      description: "Sustainable water sources"
    },
    {
      url: "https://images.unsplash.com/photo-1466611653911-95081537e5b7",
      title: "Water Treatment",
      description: "Modern water treatment facilities"
    }
  ];

  return (
    <div className="water-gallery">
      {images.map((img, index) => (
        <div key={index} className="gallery-item">
          <img src={img.url} alt={img.title} />
          <div className="gallery-overlay">
            <h4>{img.title}</h4>
            <p>{img.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="home-page">
      <FloatingDroplets />
      <Navbar />
      
      {/* Hero Section with Water Animation */}
      <section className="hero-section">
        <div className="water-bg">
          <div className="wave wave1"></div>
          <div className="wave wave2"></div>
          <div className="wave wave3"></div>
        </div>
        
        <div className="water-drops">
          {[...Array(15)].map((_, i) => (
            <div key={i} className="drop" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}></div>
          ))}
        </div>

        {/* Clock Widget - Hidden on mobile */}
        <div className="clock-widget-container hide-on-mobile">
          <PhilippineTimeClock />
        </div>

        <div className="hero-content">
          {/* Enlarged Logo */}
          <div className="logo-container">
            <img src={logo} alt="POWASSCO Logo" className="hero-logo" />
          </div>
          
          <h1 className="hero-title">
            POWASSCO
            <span className="highlight">Multipurpose Cooperative</span>
          </h1>
          
          <p className="hero-subtitle">
            <i className="fas fa-quote-left"></i>
            Empowering Communities Through Sustainable Water Management 
            and Cooperative Financial Services
            <i className="fas fa-quote-right"></i>
          </p>

          <div className="stats-preview">
            <div className="stat-item">
              <span className="stat-number">25+</span>
              <span className="stat-label">Years</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">2k+</span>
              <span className="stat-label">Members</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">20M+</span>
              <span className="stat-label">Gallons Conserved</span>
            </div>
          </div>

          <div className="hero-buttons">
            <Link to="/inquiry" className="btn btn-primary">
              <i className="fas fa-file-invoice"></i>
              Check Your Bill
            </Link>
            <Link to="/calculator" className="btn btn-secondary">
              <i className="fas fa-calculator"></i>
              Calculate Bill
            </Link>
            <Link to="/about" className="btn btn-secondary">
              <i className="fas fa-info-circle"></i>
              Learn More
            </Link>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="wave-divider">
          <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" className="shape-fill"></path>
          </svg>
        </div>

        <div className="scroll-indicator">
          <span>Scroll</span>
          <i className="fas fa-chevron-down"></i>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container">
          <h2 className="section-title">
            <i className="fas fa-water"></i>
            Our Services
            <i className="fas fa-droplet"></i>
          </h2>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-faucet"></i>
              </div>
            <h3>Bill Inquiry</h3>
<p>
  Quickly check your water bill details, consumption records, and payment status online.
</p>
<Link to="/inquiry" className="feature-link">
  View Bill <i className="fas fa-arrow-right"></i>
</Link>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-calculator"></i>
              </div>
              <h3>Tariff Calculator</h3>
              <p>Calculate your estimated water bill based on consumption and classification</p>
              <Link to="/calculator" className="feature-link">
                Calculate Now <i className="fas fa-arrow-right"></i>
              </Link>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-hand-holding-usd"></i>
              </div>
              <h3>Loan Services</h3>
              <p>Affordable loans with flexible payment terms and competitive interest rates for members</p>
              <Link to="/about" className="feature-link">
                Learn More <i className="fas fa-arrow-right"></i>
              </Link>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-hand-holding-heart"></i>
              </div>
              <h3>Community Support</h3>
              <p>Supporting our community through sustainable programs and development initiatives</p>
              <Link to="/about" className="feature-link">
                Join Us <i className="fas fa-arrow-right"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Water Gallery Section */}
      <section className="conservation-section">
        <div className="container">
          <div className="conservation-content">
            <h2 className="section-title light">
              <i className="fas fa-leaf"></i>
              Our Water Projects
              <i className="fas fa-leaf"></i>
            </h2>
            
            <p className="conservation-text">
              See the impact of our water conservation efforts across communities
            </p>

            <WaterGallery />
          </div>
        </div>
      </section>

      {/* Water Conservation Section */}
      <section className="conservation-section">
        <div className="container">
          <div className="conservation-content">
            <h2 className="section-title light">
              <i className="fas fa-leaf"></i>
              Save Water, Save Life
              <i className="fas fa-leaf"></i>
            </h2>
            
            <p className="conservation-text">
              Every drop counts! Join thousands of members in our mission to conserve water 
              for future generations. Together, we can make a difference.
            </p>

            <div className="tips-grid">
              <div className="tip-card">
                <div className="tip-number">01</div>
                <i className="fas fa-wrench"></i>
                <h4>Fix Leaks</h4>
                <p>Repair dripping taps immediately - a slow drip can waste 15 liters per day</p>
              </div>

              <div className="tip-card">
                <div className="tip-number">02</div>
                <i className="fas fa-shower"></i>
                <h4>Smart Showers</h4>
                <p>Take 5-minute showers and save up to 1000 liters per month</p>
              </div>

              <div className="tip-card">
                <div className="tip-number">03</div>
                <i className="fas fa-cloud-rain"></i>
                <h4>Rainwater</h4>
                <p>Collect rainwater for gardening and cleaning purposes</p>
              </div>

              <div className="tip-card">
                <div className="tip-number">04</div>
                <i className="fas fa-tint"></i>
                <h4>Efficient Fixtures</h4>
                <p>Install water-efficient fixtures and save up to 30% on water bills</p>
              </div>
            </div>

            <div className="water-saving-meter">
              <div className="meter-label">
                <span>Monthly Water Savings Goal</span>
                <span className="goal">1,000,000 Liters</span>
              </div>
              <div className="meter-bar"> 
                <div className="meter-fill" style={{width: '75%'}}>
                  <span className="meter-value">75% Achieved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <div className="footer-logo">
                <img src={logo} alt="POWASSCO Logo" />
                <div className="footer-logo-text">
                  <h3>POWASSCO</h3>
                  <p>Multipurpose Cooperative</p>
                </div>
              </div>
              <p className="footer-description">
                Your trusted partner in sustainable water management and cooperative banking since 1995.
              </p>
              <div className="social-links">
                <a href="#"><i className="fab fa-facebook"></i></a>
                <a href="#"><i className="fab fa-twitter"></i></a>
                <a href="#"><i className="fab fa-linkedin"></i></a>
                <a href="#"><i className="fab fa-instagram"></i></a>
              </div>
            </div>

            <div className="footer-section">
              <h4>Quick Links</h4>
              <ul>
                <li><Link to="/"><i className="fas fa-chevron-right"></i> Home</Link></li>
                <li><Link to="/inquiry"><i className="fas fa-chevron-right"></i> Bill Inquiry</Link></li>
                <li><Link to="/calculator"><i className="fas fa-chevron-right"></i> Tariff Calculator</Link></li>
                <li><Link to="/about"><i className="fas fa-chevron-right"></i> About Us</Link></li>
              </ul>
            </div>

            <div className="footer-section">
              <h4>Contact Us</h4>
              <ul className="contact-info">
                <li>
                  <i className="fas fa-phone"></i>
                  <span>(123) 456-7890</span>
                </li>
                <li>
                  <i className="fas fa-envelope"></i>
                  <span>info@powassco.com</span>
                </li>
                <li>
                  <i className="fas fa-map-marker-alt"></i>
                  <span>Brgy. Owak, Asturias, Cebu</span>
                </li>
                <li>
                  <i className="fas fa-clock"></i>
                  <span>Mon-Fri: 8:00 AM - 5:00 PM</span>
                </li>
              </ul>
            </div>

            <div className="footer-section">
              <h4>Newsletter</h4>
              <p>Subscribe for updates and water conservation tips</p>
              <form className="newsletter-form">
                <input type="email" placeholder="Your email" />
                <button type="submit"><i className="fas fa-paper-plane"></i></button>
              </form>
            </div>
          </div>

          <div className="footer-bottom">
            <p>&copy; 2026 Powassco Multipurpose Cooperative. All rights reserved.</p>
            <div className="footer-bottom-links">
              <span>Developed by Gerald Durano</span>
              <span className="separator">|</span>
              <Link to="/privacy">Privacy Policy</Link>
              <span className="separator">|</span>
              <Link to="/terms">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}