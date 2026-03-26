CREATE TABLE Users (
    User_ID SERIAL PRIMARY KEY,
    Auth_User_ID UUID UNIQUE,
    Email VARCHAR(255) UNIQUE,
    Role VARCHAR(100),
    Access_Start TIMESTAMP,
    Access_End TIMESTAMP,
    Is_Active BOOLEAN,
    Created_At TIMESTAMP DEFAULT NOW(),
    Updated_At TIMESTAMP DEFAULT NOW()
);
CREATE TABLE User_Details (
    User_Details_ID SERIAL PRIMARY KEY,
    User_ID INT,
    Photo_Path VARCHAR(255),
    First_Name VARCHAR(255),
    Middle_name VARCHAR(255),
    Last_Name VARCHAR(255),
    Suffix VARCHAR(50),
    Birthdate DATE,
    Gender VARCHAR(20),
    Street VARCHAR(255),
    Region VARCHAR(255),
    Barangay VARCHAR(255),
    City VARCHAR(255),
    Province VARCHAR(255),
    Country VARCHAR(255),
    Contact_Number VARCHAR(50),
    Joined_Date DATE,
    Created_At TIMESTAMP DEFAULT NOW(),
    Updated_At TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (User_ID) REFERENCES Users(User_ID),
);

CREATE TABLE Audit_Logs (
    Log_ID SERIAL PRIMARY KEY,
    User_ID INT,
    Action VARCHAR(255),
    Description TEXT,
    Time TIMESTAMP DEFAULT NOW(),
    User_Email VARCHAR(255),
    Resource VARCHAR(255),
    Status VARCHAR(50),




    FOREIGN KEY (User_ID) REFERENCES Users(User_ID)
);

Add super admin

-- First statement: Added semicolon and replaced empty strings with NULL
INSERT INTO Users (Auth_User_ID, Email, Role, Access_Start, Access_End, Is_Active)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'aessuriaga@email.com', 'SuperAdmin', NULL, NULL, TRUE);

-- Second statement: Now the engine knows this is a separate command
INSERT INTO User_Details ( 
    User_ID, Photo_Path, First_Name, Middle_name, Last_Name, Suffix, 
    Birthdate, Gender, Street, Region, Barangay, City, Province, 
    Country, Contact_Number, Joined_Date 
) 
VALUES (
    1, '/images/profiles/juan.jpg', 'Jose Adrian', 'Estrella', 'Suriaga', '', 
    '2005-07-08', 'Male', '0153, Santo Cristo', 'Region III', 'Santo Cristo', 
    'Angat', 'Bulacan', 'Philippines', '+63 919 399 9824', '2026-01-01'
);




