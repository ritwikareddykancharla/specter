/** The spec Specter haunts out of the box: the Cauldron & Co. demo storefront in /target. */
export const DEFAULT_SPEC = `# Cauldron & Co. storefront

## Requirement 1: Cart
1.1 WHEN the shopper adds a potion THEN the cart count SHALL increase by exactly 1.
    probe: visit; remember number #cart-count as before; click [data-add=toad]; expect number #cart-count == before + 1
1.2 The cart subtotal SHALL always equal the sum of its line prices.
    monitor: number #cart-subtotal == sum .line-price

## Requirement 2: Discount codes
2.1 WHEN the shopper applies code BOO10 THEN the total SHALL drop by exactly 10%.
    probe: visit; click [data-add=bat]; remember number #cart-subtotal as sub; type #code "BOO10"; click #apply; expect number #cart-total == round2(sub * 0.9)
2.2 IF the code is unknown THEN the system SHALL say so and SHALL NOT change the total.
    probe: visit; click [data-add=bat]; remember number #cart-total as before; type #code "TRICK"; click #apply; expect text #code-msg contains "Unknown"; expect number #cart-total == before

## Requirement 3: Search
3.1 WHEN the shopper searches THEN matching potions SHALL appear within 800 ms.
    probe: visit; type #search "toad"; expect visible .result within 800ms

## Requirement 4: Checkout
4.1 IF the email address is invalid THEN the system SHALL show an error and SHALL NOT place the order.
    probe: visit; click [data-add=moon]; type #email "ghost"; click #checkout; expect visible #email-error; expect hidden #order-placed after 300ms
4.2 The storefront SHALL never throw an uncaught error.
    monitor: no errors in 20s
`;
