# 📋 n8n Setup Guide - JeanTrail Browser Automation

**Version:** 1.0.0  
**Last Updated:** 2025-11-30

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Access n8n Dashboard
```
http://localhost:5678
```

### Step 2: Create First Workflow
1. Click "Create Workflow" button (top right)
2. Name it: `WF#1 - Webhook Receiver`
3. Click "Add first step"

### Step 3: Add Webhook Trigger
1. Search for "Webhook" node
2. Select "On webhook call"
3. Choose HTTP Method: **POST**
4. Copy the Webhook URL (you'll need this for Colab scripts)

### Step 4: Add HTTP Request Node
1. Click the + button to add next step
2. Search "HTTP Request"
3. Configure:
   - Method: POST
   - URL: `http://localhost:3000/api/incoming-products`
   - Enable "Send Body"
   - Body Content Type: JSON

### Step 5: Save Workflow
- Click "Save" button
- Workflow is now active and listening for webhooks

---

## 📊 Complete Workflows Setup

### WF#1: Webhook Receiver ✅ (Already Created Above)
- **Trigger:** HTTP POST from Colab
- **Action:** Parse and forward to WF#2
- **Webhook URL:** Copy from your instance

### WF#2: Feed Today - Incoming Products
1. Create new Workflow: `WF#2 - Feed Today`
2. **Trigger:** "On app event" → Manual
3. **Node 1:** HTTP Request (POST /api/incoming-products)
4. **Node 2:** Create Promo Code (Code node: generate random string)
5. **Node 3:** Set Timer (wait 24 hours)

### WF#3: Admin Dashboard Queue
1. Create new Workflow: `WF#3 - Admin Queue`
2. **Trigger:** Manual
3. **Node 1:** HTTP Request (POST /api/admin/queue)
4. **Node 2:** Send Email (to info@jeantrail.com)

### WF#4: Claude AI Analysis (Trigger Later)
1. Create new Workflow: `WF#4 - Claude Analysis`
2. **Trigger:** Webhook call
3. **Node 1:** Code node - format data for Claude
4. **Node 2:** HTTP Request - call Claude API
5. **Node 3:** Parse response and save

### WF#5: 24hr Auto Promote
1. Create new Workflow: `WF#5 - Auto Promote`
2. **Trigger:** Cron (every 1 minute)
3. **Node 1:** Query expired products (code node)
4. **Node 2:** HTTP Request - move to subcategory

### WF#6: Suppliers Scanner
1. Create new Workflow: `WF#6 - Suppliers Scanner`
2. **Trigger:** Cron (weekly)
3. **Node 1:** Fetch supplier data
4. **Node 2:** HTTP Request (POST /api/shipping-providers)

### WF#7-10: Remaining Workflows
- Follow similar patterns
- Each focused on specific task

---

## 🔗 Webhook URLs Reference

Each account gets different webhook URLs:

| Workflow | URL | Purpose |
|----------|-----|----------|
| WF#1 | `http://localhost:5678/webhook/jeantrail-incoming-product` | Products from Colab |
| WF#4 | `http://localhost:5678/webhook/ai-analysis-result` | Claude AI analysis |
| WF#8 | `http://localhost:5678/webhook/promo-code-gen` | Generate promo codes |

**Note:** Copy each Webhook URL and paste into your Colab scripts

---

## 🧪 Testing Workflows

### Test with Mock Data
```json
{
  "productId": "TEST_001",
  "name": "Test Product",
  "category": "Apparel & Accessories",
  "subcategory": "Bermuda Shorts",
  "price": 25.50,
  "supplier": {
    "name": "Test Supplier",
    "location": "China",
    "rating": 4.8
  }
}
```

### Execute Workflow
1. Open workflow
2. Click "Execute workflow" button
3. Check Execution tab for logs
4. Verify HTTP Request responses

---

## ⚠️ Common Issues

### Issue: Webhook not receiving data
- **Solution:** Check firewall allows port 5678
- Verify Colab script webhook URL matches exactly
- Check network connectivity: `curl http://localhost:5678/health`

### Issue: HTTP Request failing
- **Solution:** Check target URL is accessible
- Verify request body format is valid JSON
- Check authentication headers if needed

### Issue: Cron trigger not working
- **Solution:** Ensure n8n is running continuously
- Check cron expression syntax (use crontab.guru)
- Verify n8n logs for errors

---

## 📚 Documentation

- n8n Docs: https://docs.n8n.io
- HTTP Request Node: https://docs.n8n.io/nodes/n8n-nodes-base.httpRequest/
- Webhook Node: https://docs.n8n.io/nodes/n8n-nodes-base.webhook/

