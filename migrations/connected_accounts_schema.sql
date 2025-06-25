-- SQL Schema for Connected Accounts Support

-- Create ConnectedAccounts table to track Stripe connected accounts
CREATE TABLE IF NOT EXISTS ConnectedAccounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL COMMENT 'Stripe account ID (acct_...)',
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    business_type ENUM('individual', 'company', 'non_profit', 'government_entity') DEFAULT 'individual',
    status ENUM('pending', 'active', 'rejected', 'disabled') DEFAULT 'pending',
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (account_id),
    INDEX (email),
    INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add connected_account_id column to Payments table
ALTER TABLE Payments
ADD COLUMN connected_account_id VARCHAR(255) NULL COMMENT 'Stripe connected account ID if applicable',
ADD INDEX (connected_account_id);

-- Create ConnectedAccountPayouts table to track payouts to connected accounts
CREATE TABLE IF NOT EXISTS ConnectedAccountPayouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    connected_account_id VARCHAR(255) NOT NULL,
    payout_id VARCHAR(255) NOT NULL COMMENT 'Stripe payout ID',
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) NOT NULL,
    arrival_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (connected_account_id) REFERENCES ConnectedAccounts(account_id) ON DELETE CASCADE,
    UNIQUE KEY (payout_id),
    INDEX (status),
    INDEX (arrival_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create ConnectedAccountBalances table to track balances of connected accounts
CREATE TABLE IF NOT EXISTS ConnectedAccountBalances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    connected_account_id VARCHAR(255) NOT NULL,
    available_balance DECIMAL(10, 2) DEFAULT 0.00,
    pending_balance DECIMAL(10, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'usd',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connected_account_id) REFERENCES ConnectedAccounts(account_id) ON DELETE CASCADE,
    UNIQUE KEY (connected_account_id, currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create ConnectedAccountWebhookEvents table to track webhook events for connected accounts
CREATE TABLE IF NOT EXISTS ConnectedAccountWebhookEvents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    connected_account_id VARCHAR(255) NOT NULL,
    event_id VARCHAR(255) NOT NULL COMMENT 'Stripe event ID',
    event_type VARCHAR(255) NOT NULL,
    event_data JSON,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connected_account_id) REFERENCES ConnectedAccounts(account_id) ON DELETE CASCADE,
    UNIQUE KEY (event_id),
    INDEX (event_type),
    INDEX (processed),
    INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;