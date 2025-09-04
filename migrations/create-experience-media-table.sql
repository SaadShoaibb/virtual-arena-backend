-- Create ExperienceMedia table for managing images and videos for each VR experience
CREATE TABLE IF NOT EXISTS ExperienceMedia (
    media_id INT AUTO_INCREMENT PRIMARY KEY,
    experience_name VARCHAR(255) NOT NULL,
    media_type ENUM('image', 'video') NOT NULL,
    media_url VARCHAR(500) NOT NULL,
    media_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_experience_name (experience_name),
    INDEX idx_media_type (media_type),
    INDEX idx_is_active (is_active)
);

-- Insert default media for existing experiences
INSERT INTO ExperienceMedia (experience_name, media_type, media_url, media_order, is_active) VALUES
-- Free Roaming Arena
('free-roaming-arena', 'image', '/assets/experiences/arena/arena1.jpeg', 1, TRUE),
('free-roaming-arena', 'image', '/assets/experiences/arena/arena2.jpeg', 2, TRUE),
('free-roaming-arena', 'image', '/assets/experiences/arena/arena3.jpeg', 3, TRUE),
('free-roaming-arena', 'image', '/assets/experiences/arena/arena4.jpeg', 4, TRUE),
('free-roaming-arena', 'image', '/assets/experiences/arena/arena5.jpeg', 5, TRUE),
('free-roaming-arena', 'image', '/assets/experiences/arena/arena6.jpeg', 6, TRUE),

-- VR Battle
('vr-battle', 'image', '/assets/experiences/vrbattle/vrbattle.jpeg', 1, TRUE),

-- UFO Spaceship
('ufo-spaceship', 'image', '/assets/experiences/ufo/ufo.jpeg', 1, TRUE),

-- VR 360
('vr-360', 'image', '/assets/experiences/vr360/vr360.jpeg', 1, TRUE),

-- VR Cat
('vr-cat', 'image', '/assets/experiences/vrcat/vrcat.jpeg', 1, TRUE),

-- VR Warrior
('vr-warrior', 'image', '/assets/experiences/vrwarrior/vrwarrior.jpeg', 1, TRUE),

-- Photo Booth
('photo-booth', 'image', '/assets/experiences/photobooth/photobooth.jpeg', 1, TRUE);