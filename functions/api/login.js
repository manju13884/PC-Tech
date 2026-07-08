export async function onRequestPost(context) {
  const body = await context.request.json();

  return Response.json({
    authenticated: true,
    username: body.username,
    message: "Cloudflare Function is working!"
  });
}