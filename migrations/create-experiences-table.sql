-- Create Experiences table
CREATE TABLE IF NOT EXISTS Experiences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    features JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_is_active (is_active)
);

-- Update ExperienceMedia table to link to Experiences
ALTER TABLE ExperienceMedia 
ADD COLUMN experience_id INT NULL,
ADD CONSTRAINT fk_experience_media_experience 
FOREIGN KEY (experience_id) REFERENCES Experiences(id) ON DELETE CASCADE;

-- Migrate existing data
INSERT INTO Experiences (title, slug, description, is_active) VALUES
('Free Roaming Arena', 'free-roaming-arena', 'Experience unlimited freedom in our spacious VR arena with full-body tracking and wireless headsets.', TRUE),
('VR Battle', 'vr-battle', 'Challenge your friends in our two-player VR battle arena with competitive multiplayer games.', TRUE),
('UFO Spaceship', 'ufo-spaceship', 'Immersive cinematic VR experience aboard a UFO spaceship with 360-degree visuals.', TRUE),
('VR 360', 'vr-360', 'Full 360-degree virtual reality experience with stunning visuals and immersive gameplay.', TRUE),
('VR Cat', 'vr-cat', 'Fun and family-friendly VR experience perfect for kids with creative and educational content.', TRUE),
('VR Warrior', 'vr-warrior', 'Child-friendly battle experience designed specifically for younger players aged 6-12.', TRUE),
('Photo Booth', 'photo-booth', 'Capture memorable moments with our VR photo booth experience in virtual worlds.', TRUE);

-- Link existing media to experiences
UPDATE ExperienceMedia em 
JOIN Experiences e ON em.experience_name = e.slug 
SET em.experience_id = e.id;