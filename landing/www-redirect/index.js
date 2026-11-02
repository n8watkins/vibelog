// www.vibelogs.dev -> https://vibelogs.dev, keeping the path and query string.
const worker = {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.hostname = "vibelogs.dev";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  },
};

export default worker;
