# 🤖 JeanTrail Browser - Complete Automation System

**Version:** 1.0.0  
**Last Updated:** 2025-11-30  
**Status:** Ready for Implementation

---

## 📊 System Architecture Overview

The JeanTrail Browser automation system consists of 4 interconnected layers:

### Layer 1: Data Collection (Google Colab)
- 20 parallel Colab instances (one per Gmail account)
- Scrape Alibaba.com & 1688.com for product data
- Extract: Name, Images, Price, Supplier Info, Shipping Costs
- Send via HTTP POST Webhook to n8n

### Layer 2: Workflow Orchestration (n8n)
- 10 automated workflows
- Webhook receiver → Product processing → Database updates
- Real-time monitoring and error alerts

### Layer 3: Application (JeanTrail Browser - Electron)
- REST API endpoints for product management
- UI Pages: Today's Incoming Feed, Categories, Admin Dashboard
- SQLite/PostgreSQL database

### Layer 4: Intelligence (Claude/Jean AI)
- Price optimization analysis
- Supplier evaluation
- Shipping method selection
- Profit margin calculation

---

## 📋 n8n Workflows (Quick Reference)

| # | Name | Trigger | Function |
|---|------|---------|----------|
| 1 | Webhook Receiver | HTTP POST | Receive products from Colab |
| 2 | Feed Today - Incoming | WF#1 Complete | Add product to Today's Feed (24h) |
| 3 | Admin Dashboard Queue | WF#2 Complete | Queue for price analysis |
| 4 | Claude AI Analysis | Manual / Scheduled | Analyze & price product |
| 5 | 24hr Auto Promote | Cron (every minute) | Move product to final location |
| 6 | Suppliers Scanner | Cron (weekly) | Update supplier database |
| 7 | Monitor & Alerts | Cron (every 30 min) | Health check & error notifications |
| 8 | Promo Code Generator | WF#2 Trigger | Create unique promo codes |
| 9 | Rate Limit Manager | Cron (every 5 min) | Control request rate |
| 10 | Daily Report | Cron (daily 11:59 PM) | Send summary email |

---

## 🔗 Account Distribution

**20 Gmail Accounts** distributed across Subcategories:
- Each account handles 2-3 Subcategories
- Request rate: 10 requests/minute (to avoid blocking)
- Parallel execution for faster data collection

---

## 🚀 Quick Start

### Step 1: n8n Setup
1. Open n8n dashboard (http://localhost:5678)
2. Import Workflow #1-10 configurations
3. Configure webhooks and API endpoints
4. Test with mock data

### Step 2: Google Colab Setup
1. Create Colab script in each Gmail account
2. Schedule script to run hourly
3. Configure webhook URLs from n8n

### Step 3: JeanTrail Browser API Setup
1. Implement endpoints in src/api/
2. Create database schema
3. Connect to n8n workflows

---

## 📚 Detailed Documentation

See individual files for complete specifications:
- `n8n-workflows/` - All Workflow JSON exports
- `colab-templates/` - Scraping script templates
- `api-spec/` - REST API endpoints
- `database-schema/` - SQLite schema

