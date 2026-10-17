// Links are rendered, never fetched by our server. Reject executable/local/credential URLs.
export function website(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      value.length > 1200 ||
      !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(':') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
    )
      return null
    return url.href
  } catch {
    return null
  }
}
