# n8n Workflow Setup Guide - JeanTrail Alibaba Scraper

## 📋 Overview
This guide provides step-by-step instructions for setting up the complete n8n workflow for JeanTrail's Alibaba product scraping and distribution system.

## 🔧 Prerequisites
- n8n instance running locally or in the cloud
- Google Colab notebooks created (JEANTRAIL001-010)
- JeanTrail API ready at http://localhost:3000/api/incoming-products
- Slack webhook URL (optional but recommended)
- Google Sheets API setup (for reporting)

## 📊 Workflow Architecture

### Main Components:
1. **Cron Trigger** - Daily schedule at 02:00 UTC
2. **Account Selector** - Distributes work across 10 Gmail accounts
3. **Category Assigner** - Assigns 5 subcategories per account
4. **Colab Trigger** - Executes scraper notebooks
5. **Product Parser** - Extracts product data
6. **API Sender** - Pushes products to JeanTrail Store
7. **Google Sheets Logger** - Records metrics
8. **Slack Notifier** - Sends completion alerts

## 🚀 Step-by-Step Setup

### Step 1: Create n8n Workflow
1. Login to n8n
2. Click "+ New Workflow"
3. Name it: "JeanTrail - Alibaba Scraper Distribution"
4. Save (Ctrl+S)

### Step 2: Add Trigger Node
1. Click "+" → Add Cron Node
2. Configure:
   - Cron Expression: `0 2 * * *` (02:00 UTC daily)
   - Description: "Daily Scraper Trigger"

### Step 3: Add Account Selection Node
1. Add Function Node
2. Name: "Account Selector"
3. Code:
```javascript
const accounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const output = [];
for (let i = 0; i < accounts.length; i++) {
  output.push({
    account_number: accounts[i],
    email: `jeantrail${String(accounts[i]).padStart(3, '0')}@gmail.com`,
    account_id: `JEANTRAIL${String(accounts[i]).padStart(3, '0')}`
  });
}
return output.map(acc => ({ json: acc }));
```

### Step 4: Add Category Assignment Node
1. Add Function Node
2. Name: "Assign Categories"
3. Code:
```javascript
const categories = {
  001: ['Bermuda Shorts', 'Cravats', 'Formal Wear', 'Casual Jackets', 'Accessories Pack'],
  002: ['T-Shirts', 'Polos', 'Button-ups', 'Sweaters', 'Hoodies'],
  003: ['Jeans', 'Trousers', 'Shorts', 'Skirts', 'Leggings'],
  004: ['Dresses', 'Jumpsuits', 'Rompers', 'Playsuits', 'Shifts'],
  005: ['Blazers', 'Coats', 'Jackets', 'Vests', 'Cardigans'],
  006: ['Shoes', 'Boots', 'Sandals', 'Sneakers', 'Loafers'],
  007: ['Socks', 'Stockings', 'Tights', 'Leg Warmers', 'Garters'],
  008: ['Hats', 'Caps', 'Beanies', 'Scarves', 'Gloves'],
  009: ['Belts', 'Bags', 'Wallets', 'Jewelry', 'Watches'],
  010: ['Sunglasses', 'Glasses', 'Headwear', 'Hair Accessories', 'Ethnic Wear']
};

const accountId = $input.item.json.account_id.slice(-3);
return [{
  json: {
    ...this.first().json,
    categories: categories[accountId] || []
  }
}];
```

### Step 5: Add HTTP Request Node (Colab Trigger)
1. Add HTTP Request Node
2. Configuration:
   - Method: POST
   - URL: `{{ $env.COLAB_WEBHOOK_URL }}`
   - Headers: `Authorization: Bearer {{ $secrets.COLAB_API_KEY }}`
   - Body:
```json
{
  "account_id": "{{ $node['Account Selector'].json.account_id }}",
  "categories": {{ JSON.stringify($node['Assign Categories'].json.categories) }},
  "execution_id": "{{ $execution.id }}",
  "timestamp": "{{ new Date().toISOString() }}"
}
```

### Step 6: Add Wait Node
- Duration: 5 minutes (can adjust based on scraping time)

### Step 7: Add Product Parser Node
1. Add Function Node
2. Name: "Parse Products"
3. Code:
```javascript
const data = $input.item.json;
if (!data.products || !Array.isArray(data.products)) {
  return [{ json: { products: [], count: 0 } }];
}

const parsed = data.products.map(p => ({
  id: p.id,
  name: p.name,
  category: p.category,
  subcategory: p.subcategory,
  price: p.selling_price,
  promo_code: p.promo_code,
  promotion_end: p.promotion_end_date,
  images: p.images,
  account_id: data.account_id,
  timestamp: new Date().toISOString()
}));

return [{ json: { products: parsed, count: parsed.length } }];
```

### Step 8: Add API Sender Node (Looping)
1. Add Set Node → Configure Loop
2. Add HTTP Request Node:
   - Method: POST
   - URL: `http://localhost:3000/api/incoming-products`
   - Headers: `Content-Type: application/json, Authorization: Bearer {{ $secrets.JEANTRAIL_API_KEY }}`
   - Body: `{{ $node['Parse Products'].json.product }}`

### Step 9: Add Google Sheets Logger
1. Add Google Sheets Node
2. Operation: Append
3. Sheet: "JeanTrail Scraper Logs"
4. Values:
   - Date: `{{ now }}`
   - Account: `{{ $node['Account Selector'].json.account_id }}`
   - Products Scraped: `{{ $node['Parse Products'].json.count }}`
   - Status: "Success/Error"
   - Duration: `{{ $execution.executionTime }}`

### Step 10: Add Slack Notifier
1. Add Slack Node
2. Send to: `#jeantrail-automation`
3. Message:
```
✅ JeanTrail Scraper Run Completed
Account: {{ $node['Account Selector'].json.account_id }}
Products: {{ $node['Parse Products'].json.count }}
Status: {{ $execution.status }}
Time: {{ now }}
```

## 🔐 Environment Variables Setup

In n8n Settings → Environment Variables, add:
```
COLAB_WEBHOOK_URL=https://colab.research.google.com/api/notebooks/execute
COLAB_API_KEY=xxxxxxxxxxxx
JEANTRAIL_API_KEY=xxxxxxxxxxxx
GOOGLE_SHEETS_ID=xxxxxxxxxxxx
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxxxx
```

## ⚙️ Configuration & Execution

1. **Test the workflow:**
   - Click "Execute Workflow" button
   - Monitor execution in real-time
   - Check logs for errors

2. **Activate scheduling:**
   - Enable workflow activation toggle
   - System will run daily at 02:00 UTC

3. **Monitor executions:**
   - View execution history
   - Check Google Sheets for logs
   - Monitor Slack notifications

## 📊 Expected Results

After successful run:
- ✅ 10 Colab notebooks trigger in sequence (10-minute intervals)
- ✅ 500+ products extracted daily (50 per account)
- ✅ Products appear in JeanTrail Store
- ✅ Google Sheets updated with metrics
- ✅ Slack notification received

## 🐛 Troubleshooting

### Colab trigger fails
- Check COLAB_API_KEY is valid
- Verify webhook URL is accessible
- Ensure Colab notebooks are public or accessible

### Products not appearing in API
- Verify JEANTRAIL_API_KEY
- Check API endpoint is running
- Review API response logs

### Google Sheets not updating
- Authenticate Google Sheets node
- Verify sheet ID and sheet name
- Check Google Sheets API is enabled

## 🎯 Next Steps

1. Scale to additional categories
2. Integrate price intelligence
3. Add admin approval workflow
4. Setup alerts for failures
5. Implement retry logic

---
**Last Updated:** $(date)
**Version:** 1.0.0
