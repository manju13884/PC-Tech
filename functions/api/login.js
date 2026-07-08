export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const username = context.env.ADMIN_USERNAME;
    const password = context.env.ADMIN_PASSWORD;

    if (
      body.username === username &&
      body.password === password
    ) {
      return Response.json({
        authenticated: true,
        username: username
      });
    }

    return Response.json(
      {
        error: "Invalid username or password"
      },
      {
        status: 401
      }
    );

  } catch (err) {
    return Response.json(
      {
        error: err.message
      },
      {
        status: 500
      }
    );
  }
}