-- Giving module database schema  
-- Donation processing and financial management tables

-- Funds table - donation categories
CREATE TABLE IF NOT EXISTS funds (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  name varchar(50) NOT NULL,
  description TEXT,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_funds_church (churchId)
);

-- Donations table - individual donation records
CREATE TABLE IF NOT EXISTS donations (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  batchId varchar(36),
  personId varchar(36),
  paymentMethodId varchar(36),
  amount decimal(10,2) NOT NULL,
  fee decimal(10,2) DEFAULT 0,
  donationDate date NOT NULL,
  method varchar(20),
  methodDetails TEXT,
  notes TEXT,
  anonymous boolean DEFAULT false,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_donations_church (churchId),
  INDEX idx_donations_person (personId),
  INDEX idx_donations_batch (batchId),
  INDEX idx_donations_date (donationDate)
);

-- Donation funds table - allocation of donations to funds
CREATE TABLE IF NOT EXISTS donationFunds (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  donationId varchar(36) NOT NULL,
  fundId varchar(36) NOT NULL,
  amount decimal(10,2) NOT NULL,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_donationFunds_church (churchId),
  INDEX idx_donationFunds_donation (donationId),
  INDEX idx_donationFunds_fund (fundId)
);

-- Payment methods table - stored payment information
CREATE TABLE IF NOT EXISTS paymentMethods (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  personId varchar(36) NOT NULL,
  name varchar(50),
  type varchar(20),
  last4 varchar(4),
  expirationMonth int,
  expirationYear int,
  stripeCustomerId varchar(255),
  stripePaymentMethodId varchar(255),
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_paymentMethods_church (churchId),
  INDEX idx_paymentMethods_person (personId)
);

-- Batches table - grouping donations for processing
CREATE TABLE IF NOT EXISTS batches (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  name varchar(100) NOT NULL,
  batchDate date NOT NULL,
  totalAmount decimal(10,2) DEFAULT 0,
  donationCount int DEFAULT 0,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_batches_church (churchId),
  INDEX idx_batches_date (batchDate)
);

-- Subscriptions table - recurring donations
CREATE TABLE IF NOT EXISTS subscriptions (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  personId varchar(36) NOT NULL,
  paymentMethodId varchar(36) NOT NULL,
  amount decimal(10,2) NOT NULL,
  frequency varchar(20) NOT NULL,
  interval_count int DEFAULT 1,
  startDate date NOT NULL,
  endDate date,
  status varchar(20) DEFAULT 'active',
  stripeSubscriptionId varchar(255),
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_subscriptions_church (churchId),
  INDEX idx_subscriptions_person (personId),
  INDEX idx_subscriptions_status (status)
);

-- Gateway payment methods - unified vault storage across providers
CREATE TABLE IF NOT EXISTS gatewayPaymentMethods (
  id char(11) NOT NULL PRIMARY KEY,
  churchId char(11) NOT NULL,
  gatewayId char(11) NOT NULL,
  customerId varchar(255) NOT NULL,
  externalId varchar(255) NOT NULL,
  methodType varchar(50),
  displayName varchar(255),
  metadata json,
  createdAt datetime DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_gateway_payment_methods_external (gatewayId, externalId),
  INDEX idx_gateway_payment_methods_church (churchId),
  INDEX idx_gateway_payment_methods_customer (customerId)
);
