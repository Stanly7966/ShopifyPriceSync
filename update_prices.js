const axios = require('axios');

const SHOP = process.env.SHOPIFY_STORE; // From GitHub Secret
const TOKEN = process.env.SHOPIFY_TOKEN;

// Sleep function to throttle API calls
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Shopify REST Admin API base
const api = axios.create({
  baseURL: `https://${SHOP}/admin/api/2024-04`,
  headers: {
    'X-Shopify-Access-Token': TOKEN,
    'Content-Type': 'application/json',
  },
});

async function updatePrices() {
  let pageInfo = null;

  try {
    do {
      const res = await api.get('/products.json', {
        params: {
          limit: 50,
          page_info: pageInfo,
        },
      });

      const products = res.data.products;

      for (const product of products) {
        for (const variant of product.variants) {
          const variantId = variant.id;
          const inventoryItemId = variant.inventory_item_id;
          const weight = parseFloat(variant.weight); // in grams

          // Step 1: Get the cost from inventory item
          const inventoryRes = await api.get(`/inventory_items/${inventoryItemId}.json`);
          const cost = parseFloat(inventoryRes.data.inventory_item.cost);

          if (!cost || isNaN(cost)) {
            console.log(`⚠️ Skipping variant ${variantId} (no valid cost)`);
            continue;
          }

          // Step 2: Calculate new price based on weight
          let rawPrice;
          if (weight < 5) {
            rawPrice = (cost * 1.3 + 10).toFixed(2);
          } else {
            rawPrice = (cost * 1.3 + 20).toFixed(2);
          }

          const newPrice = Math.ceil(rawPrice);
          console.log(`✅ Updating variant ${variantId} | Cost: £${cost}, Weight: ${weight}g → Price: £${newPrice}`);

          // Step 3: Update the variant's price
          try {
            await api.put(`/variants/${variantId}.json`, {
              variant: {
                id: variantId,
                price: newPrice,
              },
            });

            // ✅ Throttle to avoid rate limit: 2 requests/sec
            await sleep(600);
          } catch (err) {
            console.error(`❌ Error updating variant ${variantId}:`, err.response?.data || err.message);
          }
        }
      }

      // Step 4: Pagination support
      const linkHeader = res.headers['link'];
      const match = linkHeader && linkHeader.match(/<([^>]+)>; rel="next"/);
      pageInfo = match ? new URL(match[1]).searchParams.get("page_info") : null;

    } while (pageInfo);

    console.log("🎉 All prices updated successfully!");
  } catch (error) {
    console.error("❌ Error updating prices:", error.response?.data || error.message);
  }
}

updatePrices();
