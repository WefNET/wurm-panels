declare module 'algebrite' {
    // Minimal typings for the parts we use. Expand if you use more functions.
    interface AlgebriteStatic {
        nroots(expr: string): any;
        run?(expr: string): any;
        // Allow access to any other members returned by library
        [key: string]: any;
    }

    const Algebrite: AlgebriteStatic;
    export default Algebrite;
}
