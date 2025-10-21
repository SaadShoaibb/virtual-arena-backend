-- Homepage Content Table (multilingual)
CREATE TABLE IF NOT EXISTS homepage_content (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_key VARCHAR(50) NOT NULL,
    locale VARCHAR(5) NOT NULL DEFAULT 'en',
    title VARCHAR(255),
    subtitle TEXT,
    description TEXT,
    button_text VARCHAR(100),
    button_link VARCHAR(255),
    image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_section_locale (section_key, locale)
);

-- FAQ Table (multilingual)
CREATE TABLE IF NOT EXISTS faqs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    locale VARCHAR(5) NOT NULL DEFAULT 'en',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Testimonials Table (multilingual)
CREATE TABLE IF NOT EXISTS testimonials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    locale VARCHAR(5) NOT NULL DEFAULT 'en',
    name VARCHAR(100) NOT NULL,
    role VARCHAR(100),
    feedback TEXT NOT NULL,
    rating INT DEFAULT 5,
    image_url VARCHAR(255),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default English FAQs
INSERT INTO faqs (locale, question, answer, display_order) VALUES
('en', 'What is Virtual Arena (VRA)?', 'Virtual Arena is a premium destination for immersive VR gaming experiences. From solo adventures to multiplayer tournaments, VRA brings cutting-edge technology and unforgettable fun under one roof.', 1),
('en', 'Do I need prior VR experience to play?', 'Not at all! Whether you''re a beginner or a seasoned gamer, VRA is designed for all skill levels. Our team will guide you through everything you need to get started.', 2),
('en', 'What kind of games are available at VRA?', 'We offer a wide variety of VR games—from action and adventure to puzzle-solving and sports simulations. There''s something exciting for everyone.', 3),
('en', 'Is VRA suitable for group events or parties?', 'Absolutely! VRA is perfect for birthday parties, corporate events, team-building sessions, and group hangouts. Ask us about our group booking packages!', 4);

-- Insert default French FAQs
INSERT INTO faqs (locale, question, answer, display_order) VALUES
('fr', 'Qu''est-ce que Virtual Arena (VRA) ?', 'Virtual Arena est une destination premium pour des expériences de jeu VR immersives. Des aventures solo aux tournois multijoueurs, VRA réunit une technologie de pointe et un plaisir inoubliable sous un même toit.', 1),
('fr', 'Ai-je besoin d''une expérience VR préalable pour jouer ?', 'Pas du tout ! Que vous soyez débutant ou joueur expérimenté, VRA est conçu pour tous les niveaux de compétence. Notre équipe vous guidera à travers tout ce dont vous avez besoin pour commencer.', 2),
('fr', 'Quels types de jeux sont disponibles chez VRA ?', 'Nous proposons une grande variété de jeux VR, de l''action et l''aventure à la résolution d''énigmes et aux simulations sportives. Il y a quelque chose d''excitant pour tout le monde.', 3),
('fr', 'VRA convient-il aux événements de groupe ou aux fêtes ?', 'Absolument ! VRA est parfait pour les fêtes d''anniversaire, les événements d''entreprise, les sessions de team-building et les sorties en groupe. Renseignez-vous sur nos forfaits de réservation de groupe !', 4);

-- Insert default English Testimonials
INSERT INTO testimonials (locale, name, role, feedback, rating, display_order) VALUES
('en', 'Esther Howard', 'Client Feedback', 'Virtual Arena exceeded all my expectations! The VR experience was incredibly immersive, and the staff was super helpful. Perfect for a fun day out with friends!', 5, 1),
('en', 'Michael Lee', 'Client Feedback', 'I hosted my birthday party at VRA, and it was a blast! Everyone had an amazing time. The variety of games kept us entertained for hours. Highly recommend!', 5, 2);

-- Insert default French Testimonials
INSERT INTO testimonials (locale, name, role, feedback, rating, display_order) VALUES
('fr', 'Esther Howard', 'Commentaire client', 'Virtual Arena a dépassé toutes mes attentes ! L''expérience VR était incroyablement immersive et le personnel était très serviable. Parfait pour une journée amusante entre amis !', 5, 1),
('fr', 'Michael Lee', 'Commentaire client', 'J''ai organisé ma fête d''anniversaire chez VRA et c''était génial ! Tout le monde a passé un moment incroyable. La variété de jeux nous a divertis pendant des heures. Je recommande vivement !', 5, 2);
