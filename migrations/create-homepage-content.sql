-- Create homepage content management table
CREATE TABLE IF NOT EXISTS homepage_content (
    content_id INT PRIMARY KEY AUTO_INCREMENT,
    section_key VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255),
    subtitle TEXT,
    description TEXT,
    button_text VARCHAR(100),
    button_link VARCHAR(255),
    image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default homepage sections
INSERT INTO homepage_content (section_key, title, subtitle, description, button_text, button_link, display_order) VALUES
('hero', 'Step Into a New Reality', 'Experience the Future of Gaming', 'Immerse yourself in cutting-edge VR experiences at Edmonton''s premier virtual reality arena', 'Book Now', '/book', 1),
('about', 'About VRtual Arena', 'Your Gateway to Virtual Worlds', 'We offer the most advanced VR technology and immersive experiences for individuals, groups, and corporate events', 'Learn More', '/about', 2),
('features', 'Why Choose Us', 'Premium VR Experience', 'State-of-the-art equipment, expert staff, and unforgettable adventures await you', 'Explore', '/experiences', 3),
('cta', 'Ready to Play?', 'Book Your VR Session Today', 'Join thousands of satisfied customers who have experienced the future of entertainment', 'Book Now', '/book', 4)
ON DUPLICATE KEY UPDATE section_key = section_key;
