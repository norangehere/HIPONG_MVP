-- Reconstructed Schema for HIPONG

CREATE DATABASE IF NOT EXISTS hipong_db;
USE hipong_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(255) NOT NULL UNIQUE,
    unionid VARCHAR(255),
    username VARCHAR(255),
    avatar VARCHAR(500),
    nickname VARCHAR(255),
    custom_nickname VARCHAR(255),
    gender INT,
    session_key VARCHAR(255),
    is_anonymous BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Legacy support
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    details TEXT,
    creatorId VARCHAR(255),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Favorite Places table
CREATE TABLE IF NOT EXISTS favorite_places (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(255),
    placeId VARCHAR(255),
    placeName VARCHAR(255),
    placeAddress VARCHAR(255),
    placeType VARCHAR(255),
    placeRating VARCHAR(50),
    placeCost VARCHAR(50),
    placePhotoUrl TEXT,
    placeLocation VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Personality Analysis table
CREATE TABLE IF NOT EXISTS personality_analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    nickname VARCHAR(255),
    avatar VARCHAR(500),
    custom_nickname VARCHAR(255),
    gender VARCHAR(50),
    preferred_gender VARCHAR(50),
    age_range VARCHAR(50),
    preferred_age_range VARCHAR(50),
    city VARCHAR(100),
    selected_location VARCHAR(255),
    region_value VARCHAR(100),
    cross_district BOOLEAN,
    interests TEXT,
    other_interests TEXT,
    group_types TEXT,
    personality TEXT,
    custom_personality TEXT,
    preferred_personality TEXT,
    preferred_custom_personality TEXT,
    relationship_type VARCHAR(100),
    notifications BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zuju Plans table
CREATE TABLE IF NOT EXISTS zujuplans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(255),
    play_date DATE,
    start_time TIME,
    end_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plan Locations table
CREATE TABLE IF NOT EXISTS plan_locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_id INT,
    location_id VARCHAR(255),
    location_name VARCHAR(255),
    location_address VARCHAR(255),
    price VARCHAR(50),
    drive_time VARCHAR(50),
    transit_time VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES zujuplans(id) ON DELETE CASCADE
);
