-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create buyers table
CREATE TABLE buyers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(80) NOT NULL CHECK (LENGTH(full_name) >= 2),
    email VARCHAR(255),
    phone VARCHAR(15) NOT NULL CHECK (phone ~ '^\d{10,15}$'),
    city VARCHAR(20) NOT NULL CHECK (city IN ('Chandigarh', 'Mohali', 'Zirakpur', 'Panchkula', 'Other')),
    property_type VARCHAR(20) NOT NULL CHECK (property_type IN ('Apartment', 'Villa', 'Plot', 'Office', 'Retail')),
    bhk VARCHAR(10) CHECK (bhk IN ('1', '2', '3', '4', 'Studio')),
    purpose VARCHAR(10) NOT NULL CHECK (purpose IN ('Buy', 'Rent')),
    budget_min INTEGER CHECK (budget_min >= 0),
    budget_max INTEGER CHECK (budget_max >= 0),
    timeline VARCHAR(20) NOT NULL CHECK (timeline IN ('0-3m', '3-6m', '>6m', 'Exploring')),
    source VARCHAR(20) NOT NULL CHECK (source IN ('Website', 'Referral', 'Walk-in', 'Call', 'Other')),
    status VARCHAR(20) DEFAULT 'New' CHECK (status IN ('New', 'Qualified', 'Contacted', 'Visited', 'Negotiation', 'Converted', 'Dropped')),
    notes TEXT CHECK (LENGTH(notes) <= 1000),
    tags TEXT[], -- Array of strings for tags
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT budget_check CHECK (
        (budget_min IS NULL OR budget_max IS NULL) OR 
        (budget_max >= budget_min)
    ),
    CONSTRAINT bhk_required_check CHECK (
        (property_type NOT IN ('Apartment', 'Villa')) OR 
        (bhk IS NOT NULL)
    )
);

-- Create buyer_history table for audit trail
CREATE TABLE buyer_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    diff JSONB NOT NULL -- JSON object containing changed fields
);

-- Create indexes for better performance
CREATE INDEX idx_buyers_owner_id ON buyers(owner_id);
CREATE INDEX idx_buyers_city ON buyers(city);
CREATE INDEX idx_buyers_property_type ON buyers(property_type);
CREATE INDEX idx_buyers_status ON buyers(status);
CREATE INDEX idx_buyers_timeline ON buyers(timeline);
CREATE INDEX idx_buyers_updated_at ON buyers(updated_at DESC);
CREATE INDEX idx_buyers_full_name ON buyers(full_name);
CREATE INDEX idx_buyers_phone ON buyers(phone);
CREATE INDEX idx_buyers_email ON buyers(email);

-- Create index for full-text search
CREATE INDEX idx_buyers_search ON buyers USING gin(
    to_tsvector('english', 
        COALESCE(full_name, '') || ' ' || 
        COALESCE(email, '') || ' ' || 
        COALESCE(notes, '')
    )
);

-- Create indexes for buyer_history
CREATE INDEX idx_buyer_history_buyer_id ON buyer_history(buyer_id);
CREATE INDEX idx_buyer_history_changed_at ON buyer_history(changed_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buyers_updated_at 
    BEFORE UPDATE ON buyers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
