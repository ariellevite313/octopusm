// Debug endpoint removed — do not use in production
export async function GET() {
  return new Response("Not found", { status: 404 });
}
