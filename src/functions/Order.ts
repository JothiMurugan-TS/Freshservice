import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import axios from "axios";

// Constants for the Freshservice API
const apiKey = "zQi9KIOIFz31yE4HDFL0";
const baseURL = "https://quadracopilot.freshservice.com/api/v2/purchase_orders";


// Function to get the purchase order
const getPurchaseOrders = async (): Promise<any> => {
  if (!apiKey || !baseURL) {
    console.error("API key or Base URL missing");
    throw new Error("API key and Base URL not defined");
  }

  const auth = Buffer.from(`${apiKey}:X`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
  };

  const maxRetries = 5;
  let attempts = 0;
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  while (attempts < maxRetries) {
    attempts += 1;
    console.log(`[${new Date().toISOString()}] Attempt ${attempts} to fetch data`);
    try {
      const response = await axios.get(baseURL, {
        headers,
        //timeout: 5000,  // 5 seconds timeout

      });
    console.log(response.data);

      if (!response.data || !response.data.purchase_orders) {
        console.error('Invalid data format or missing purchase orders');
        throw new Error('Invalid API response');
      }

      if (response.status !== 200) {
        console.error(`Request failed with status: ${response.status}`);
        throw new Error(`Request failed with status ${response.status}`);
      }

      console.log(`[${new Date().toISOString()}] Data fetched successfully on attempt ${attempts}`);
      return response.data;

    } catch (error) {
      console.error(`[${new Date().toISOString()}] Attempt ${attempts} failed: ${error.message}`);

      if (error.response) {
        if (error.response.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          console.log(`[${new Date().toISOString()}] Rate limit exceeded, retrying after ${retryAfter} seconds...`);
          await delay(retryAfter * 1000);
          continue;
        }
        console.error('Error Response:', JSON.stringify(error.response.data));
      }

      if (attempts >= maxRetries) {
        console.error("Reached maximum retry attempts");
        throw new Error("Failed to fetch purchase orders after multiple attempts");
      }

      // Exponential backoff delay with jitter
      const baseDelay = Math.pow(2, attempts) * 1000;
      const jitter = Math.random() * 1000;  // Add randomness to prevent thundering herd problem
      const time = baseDelay + jitter;
      console.log(`Retrying in ${(time / 1000).toFixed(2)} seconds...`);
      await delay(time);
    }
  }
};


// Function to create a Purchase order
const createPurchaseOrder = async (orderData: any): Promise<any> => {
  if (!apiKey || !baseURL) throw new Error("API key or Base URL must be defined");

  const auth = Buffer.from(`${apiKey}:X`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  try {
    const response = await axios.post(baseURL, { purchase_order: orderData }, { headers });

    if (response.status !== 201 || !response.data?.purchase_order) {
      throw new Error("Invalid API response");
    }

    return response.data.purchase_order;

  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error creating purchase order:`, error.message);

    if (error.response) {
      throw new Error(error.response.data?.message || "Failed to create purchase order");
    }

    throw new Error("Network error ");
  }
};

/**
 * HTTP handler for fetching and creating purchase orders.
 *
 * @param {HttpRequest} req - The HTTP request.
 * @param {InvocationContext} context - The Azure Functions context object.
 * @returns {Promise<HttpResponseInit>} - A promise that resolves with the HTTP response containing the purchase order information.
 */
export async function Orders(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`[${new Date().toISOString()}] HTTP trigger function processed a request.`);

  if(req.method === "GET"){
    console.log(`[${new Date().toISOString()}] GET request processing.`);
    try {
      const orderResponse = await getPurchaseOrders();
      context.log(`[${new Date().toISOString()}] Purchase orders fetched:`, JSON.stringify(orderResponse.purchase_orders));
      
      return {
        status: 200,
        jsonBody: {
          orders: orderResponse.purchase_orders,
        },
     };
  } catch (error) {
    context.log(`[${new Date().toISOString()}] Error fetching purchase orders:`, error);

    return {
      status: 500,
      jsonBody: {
        error: "An error occurred while fetching the purchase orders. Please try again later or provide specific details for better results.",
      },
    };
  }

}  else if (req.method === "POST") {
  console.log(`[${new Date().toISOString()}]  Processing POST request`);

  try {
    // Log the raw request body before parsing
    const rawBody = await req.text();
    console.log(`[${new Date().toISOString()}] Raw request body:`, rawBody);

    // Parse JSON body
    const orderData = JSON.parse(rawBody);
    console.log(`[${new Date().toISOString()}] Received orderData:`, JSON.stringify(orderData));

    //ensure orderdata is not empty
    if (!orderData || Object.keys(orderData).length === 0) {
      console.warn(`[${new Date().toISOString()}] [WARN] Received empty order data.`);
      return {
        status: 400,
        jsonBody: { error: "Invalid request: Order data cannot be empty." },
      };
    }

    console.log(`[${new Date().toISOString()}] [INFO] Calling createPurchaseOrder function.`);
    const newOrder = await createPurchaseOrder(orderData);
    console.log(`[${new Date().toISOString()}] [SUCCESS] Purchase order created successfully.`);

    return {
      status: 201,
      jsonBody: newOrder,
    };
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] [ERROR] Error creating purchase order:`, error.message);

    return {
      status: 500,
      jsonBody: { error: "Failed to create purchase order. Please try again." },
    };
  }
}
}
app.http("Orders", {
  methods: ["GET","POST"],
  authLevel: "anonymous",
  handler: Orders,
});