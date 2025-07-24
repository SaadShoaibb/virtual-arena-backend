const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function addSampleTournaments() {
    try {
        console.log('Adding sample tournaments with rules and requirements...');

        const tournaments = [
            {
                name: 'VR Arena Championship 2025',
                description: 'Epic VR battle royale tournament with 64 players competing for the ultimate prize.',
                start_date: '2025-08-15 10:00:00',
                end_date: '2025-08-15 18:00:00',
                city: 'Edmonton',
                country: 'Canada',
                state: 'AB',
                ticket_price: 25.00,
                max_participants: 64,
                prize_pool: 2500.00,
                game_type: 'Battle Royale',
                rules: `All participants must be 13 years or older
Valid government-issued ID required for registration
Players must use provided VR equipment only
Unsportsmanlike conduct will result in disqualification
Tournament organizers' decisions are final`,
                requirements: `Signed waiver form mandatory
Comfortable clothing recommended
No loose jewelry or accessories
Arrive 30 minutes before scheduled match time
Motion sickness tolerance recommended`,
                status: 'upcoming'
            },
            {
                name: 'Beat Saber Masters 2025',
                description: 'Rhythm VR tournament featuring the best Beat Saber players in Western Canada.',
                start_date: '2025-09-20 14:00:00',
                end_date: '2025-09-20 20:00:00',
                city: 'Edmonton',
                country: 'Canada',
                state: 'AB',
                ticket_price: 15.00,
                max_participants: 32,
                prize_pool: 1200.00,
                game_type: 'Rhythm',
                rules: `Minimum age requirement: 10 years old
Players must complete practice session before tournament
No custom songs allowed - official playlist only
Three strikes rule: 3 missed beats = elimination
Respect other players and equipment`,
                requirements: `Signed waiver form mandatory
Comfortable athletic clothing required
No loose jewelry or accessories
Arrive 45 minutes before tournament start
Basic rhythm game experience recommended`,
                status: 'upcoming'
            },
            {
                name: 'VR Racing Grand Prix 2025',
                description: 'High-speed VR racing tournament with realistic physics and stunning graphics.',
                start_date: '2025-10-10 12:00:00',
                end_date: '2025-10-10 17:00:00',
                city: 'Edmonton',
                country: 'Canada',
                state: 'AB',
                ticket_price: 20.00,
                max_participants: 24,
                prize_pool: 1800.00,
                game_type: 'Racing',
                rules: `Age requirement: 16 years or older
No ramming or unsportsmanlike driving
Follow track rules and racing etiquette
Penalties for cutting corners or cheating
Final lap determines winner`,
                requirements: `Valid driver's license or ID required
Signed waiver form mandatory
Comfortable clothing recommended
No loose jewelry or accessories
Motion sickness tolerance required`,
                status: 'upcoming'
            }
        ];

        for (const tournament of tournaments) {
            const [result] = await db.query(`
                INSERT INTO Tournaments (
                    name, description, start_date, end_date, city, country, state,
                    ticket_price, max_participants, prize_pool, game_type, rules, requirements, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                tournament.name,
                tournament.description,
                tournament.start_date,
                tournament.end_date,
                tournament.city,
                tournament.country,
                tournament.state,
                tournament.ticket_price,
                tournament.max_participants,
                tournament.prize_pool,
                tournament.game_type,
                tournament.rules,
                tournament.requirements,
                tournament.status
            ]);

            console.log(`✓ Added tournament: ${tournament.name} (ID: ${result.insertId})`);
        }

        console.log('✓ All sample tournaments added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding sample tournaments:', error);
        process.exit(1);
    }
}

addSampleTournaments();
