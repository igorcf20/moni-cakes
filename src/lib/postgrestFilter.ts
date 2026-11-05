// Quote a value for PostgREST `.or()` / `.and()` filter strings so user input containing
// `,` `(` `)` or `.` cannot add or change conditions (filter injection).
export const pgValue = (value: string) => `"${String(value).replace(/[\\"]/g, "\\$&")}"`;
