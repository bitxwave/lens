export const isURL = (url: string): boolean => {
  return /^https?:\/\//i.test(url);
}