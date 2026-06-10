import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/items", (_req, res) => {
  res.json([]);
});

const PORT = process.env.PORT ?? 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

export default app;
