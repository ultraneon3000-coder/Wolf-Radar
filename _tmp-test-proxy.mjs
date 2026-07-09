import { ProxyAgent, fetch as undiciFetch } from "undici";

const proxyUrl = "http://awgwvkwk-rotate:slvybfnq9qfs@p.webshare.io:80";

for (let i = 1; i <= 3; i++) {
  console.log(`\n--- Versuch ${i} ---`);
  const dispatcher = new ProxyAgent(proxyUrl);
  try {
    const res = await undiciFetch("https://httpbin.org/ip", { dispatcher });
    console.log("Status:", res.status);
    console.log(await res.text());
  } catch (err) {
    console.log("FEHLER:", err.message);
    console.log("cause:", err.cause);
  } finally {
    await dispatcher.close();
  }
}
