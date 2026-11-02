/**
 * Help-centre articles. Static, in-repo content: every id referenced by the
 * help page must exist here so no link lands on a missing article.
 */
export interface HelpArticle {
  id: string;
  title: string;
  category: HelpCategoryId;
  updated: string;
  content: string;
}

export type HelpCategoryId = 'orders' | 'returns' | 'payment' | 'account' | 'contact';

export const HELP_CATEGORIES: Array<{ id: HelpCategoryId; title: string; icon: string }> = [
  { id: 'orders', title: 'Orders & Delivery', icon: 'ri-shopping-bag-line' },
  { id: 'returns', title: 'Returns & Refunds', icon: 'ri-arrow-left-right-line' },
  { id: 'payment', title: 'Payment & Pricing', icon: 'ri-bank-card-line' },
  { id: 'account', title: 'Account & Profile', icon: 'ri-user-line' },
  { id: 'contact', title: 'Contact & Support', icon: 'ri-customer-service-2-line' },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: '1',
    title: 'How do I track my order?',
    category: 'orders',
    updated: 'October 2026',
    content: `
      <h2>Tracking your order</h2>
      <p>Every order gets an order number (starting with <strong>ORD-</strong>) and, once it is packed, a tracking number (starting with <strong>SLI-</strong>). Both are in your confirmation email and SMS.</p>
      <h3>On the website</h3>
      <ol>
        <li>Open the <a href="/order-tracking">Order Tracking</a> page</li>
        <li>Enter your order number or tracking number and the email you used at checkout</li>
        <li>Click <strong>Track Order</strong> to see the current status</li>
      </ol>
      <h3>In your account</h3>
      <p>If you ordered while signed in, go to <a href="/account?tab=orders">Order History</a> to see every order with its status and a Track Order button.</p>
      <h2>What the statuses mean</h2>
      <ul>
        <li><strong>Awaiting payment:</strong> we have your order but the Mobile Money or card payment has not completed yet</li>
        <li><strong>Processing:</strong> payment received, we are picking and packing your items</li>
        <li><strong>Packaged:</strong> your parcel is sealed and handed to the rider or courier</li>
        <li><strong>Delivered:</strong> the parcel has reached you (or was collected at pickup)</li>
      </ul>
      <p>If the status has not changed for two business days, <a href="/support/ticket">open a support ticket</a> with your order number and we will chase it.</p>
    `,
  },
  {
    id: '2',
    title: 'What are the delivery times?',
    category: 'orders',
    updated: 'October 2026',
    content: `
      <h2>Delivery times across Ghana</h2>
      <p>Orders paid before <strong>2pm</strong> on a business day are dispatched the same day. Orders after 2pm, or on weekends and public holidays, go out the next business day.</p>
      <ul>
        <li><strong>Accra Metro</strong> (East Legon, Osu, Airport, Tema and nearby): 1–2 business days</li>
        <li><strong>Greater Accra</strong> (Madina, Spintex, Kasoa, Dansoman and nearby): 2–3 business days</li>
        <li><strong>Kumasi, Takoradi, Cape Coast, Tamale and other major cities:</strong> 3–4 business days</li>
        <li><strong>All other locations in Ghana:</strong> 4–5 business days</li>
      </ul>
      <p>Delivery comes at a fee that depends on your location. Our team confirms the amount with you after you place your order. Store pickup in Accra is always free.</p>
      <h3>Pre-order items</h3>
      <p>Products marked <strong>Pre-order</strong> ship when the stock lands in Ghana. The expected timing is shown on the product page and in your confirmation email.</p>
      <p>Full details are on our <a href="/shipping">Shipping &amp; Delivery</a> page.</p>
    `,
  },
  {
    id: '3',
    title: 'Can I pick up my order instead of delivery?',
    category: 'orders',
    updated: 'October 2026',
    content: `
      <h2>Free store pickup</h2>
      <p>Yes. Choose <strong>Pickup</strong> as the delivery method at checkout and there is no delivery fee.</p>
      <ol>
        <li>Place and pay for your order as usual</li>
        <li>We send an SMS and email as soon as the order is packed and ready</li>
        <li>Come to our Accra pickup point with your order number</li>
      </ol>
      <p>Orders paid before 2pm are usually ready the same day. The pickup address and opening hours are in your ready-for-pickup message and on the <a href="/contact">Contact</a> page.</p>
      <p>If someone else is collecting for you, send us their name by WhatsApp first so we can hand the parcel over.</p>
    `,
  },
  {
    id: '4',
    title: 'Can I change or cancel my order?',
    category: 'orders',
    updated: 'October 2026',
    content: `
      <h2>Changing or cancelling an order</h2>
      <p>We start packing shortly after payment, so the sooner you tell us the better.</p>
      <ul>
        <li><strong>Before it is packed:</strong> we can change the delivery address, swap a product or cancel the order. Message us on WhatsApp or <a href="/support/ticket">open a ticket</a> with your order number.</li>
        <li><strong>After it is packed or handed to the rider:</strong> we can no longer change it. You can refuse the delivery or <a href="/returns">request a return</a> once it arrives.</li>
      </ul>
      <h3>Refunds for cancelled orders</h3>
      <p>If you paid by Mobile Money or card, the refund goes back to the same number or card within 5–7 business days.</p>
      <h3>Unpaid orders</h3>
      <p>Orders that stay unpaid are cancelled automatically, so if you changed your mind before paying there is nothing you need to do.</p>
    `,
  },
  {
    id: '6',
    title: 'How do I return an item?',
    category: 'returns',
    updated: 'October 2026',
    content: `
      <h2>Starting a return</h2>
      <ol>
        <li>Go to the <a href="/returns">Returns Portal</a></li>
        <li>Enter your order number and the email you used at checkout</li>
        <li>Tick the items you want to return, choose a reason for each and add a short summary</li>
        <li>Submit the request. You will get a confirmation email straight away</li>
      </ol>
      <h2>What happens next</h2>
      <p>Our team reviews the request and emails you within <strong>2 business days</strong>. If it is approved we arrange a pickup or drop-off in Accra, or courier instructions elsewhere in Ghana.</p>
      <p>Keep the items unused, sealed and in their original packaging until you hear from us.</p>
      <p>See the <a href="/help/article/7">return policy</a> for what can be returned and the <a href="/help/article/8">refund timeline</a>.</p>
    `,
  },
  {
    id: '7',
    title: 'What is your return policy?',
    category: 'returns',
    updated: 'October 2026',
    content: `
      <h2>Return policy</h2>
      <ul>
        <li>Returns are accepted within <strong>14 days of delivery</strong></li>
        <li>Items must be unused, sealed and in their original packaging</li>
        <li>Only paid orders can be returned</li>
        <li>One return request can be open per order at a time</li>
      </ul>
      <h3>Items we cannot take back</h3>
      <p>For hygiene reasons we cannot accept opened shower gels, soaps, body splashes, skincare or vitamins unless they arrived damaged or were the wrong item.</p>
      <h3>Who pays for return delivery?</h3>
      <p>If we sent the wrong item or it arrived damaged, we cover collection. For change-of-mind returns you cover the delivery back to us.</p>
      <p>Ready to start? Use the <a href="/returns">Returns Portal</a>.</p>
    `,
  },
  {
    id: '8',
    title: 'When will I get my refund?',
    category: 'returns',
    updated: 'October 2026',
    content: `
      <h2>Refund timeline</h2>
      <ol>
        <li>We receive and inspect the returned items</li>
        <li>We confirm the refund by email</li>
        <li>The money is sent to the Mobile Money number or card used at checkout within <strong>5–7 business days</strong></li>
      </ol>
      <p>Mobile Money refunds usually arrive within a day of being sent; card refunds can take a few extra days depending on your bank.</p>
      <p>If it has been more than 7 business days since our confirmation email, <a href="/support/ticket">open a ticket</a> with your order number and we will trace it.</p>
    `,
  },
  {
    id: '11',
    title: 'What payment methods do you accept?',
    category: 'payment',
    updated: 'October 2026',
    content: `
      <h2>Ways to pay</h2>
      <ul>
        <li><strong>MTN Mobile Money</strong></li>
        <li><strong>Telecel Cash</strong> (formerly Vodafone Cash)</li>
        <li><strong>AirtelTigo Money</strong></li>
        <li><strong>Visa and Mastercard</strong> debit or credit cards</li>
      </ul>
      <p>Payments are processed by our secure payment partners. After you place the order you are taken to the payment page; for Mobile Money, approve the prompt on your phone to complete it.</p>
      <h3>Paying later</h3>
      <p>If you leave the payment page, your order is kept as <em>awaiting payment</em>. The confirmation email contains a <strong>Pay now</strong> link you can use to finish paying. Unpaid orders are not packed.</p>
      <p>We do not offer cash on delivery.</p>
    `,
  },
  {
    id: '12',
    title: 'Is my payment information secure?',
    category: 'payment',
    updated: 'October 2026',
    content: `
      <h2>Keeping your payment safe</h2>
      <p>Card and Mobile Money details are entered on our payment partners' secure pages, not on our site, and we never see or store your full card number or Mobile Money PIN.</p>
      <ul>
        <li>The whole site runs over HTTPS</li>
        <li>Each payment is confirmed back to us by the payment provider before an order is marked as paid</li>
        <li>We will never ask for your Mobile Money PIN by phone, SMS or WhatsApp</li>
      </ul>
      <p>If you receive a suspicious message claiming to be from AbbyGlow, do not reply and <a href="/contact">let us know</a>.</p>
    `,
  },
  {
    id: '13',
    title: 'Can I pay a deposit and the balance later?',
    category: 'payment',
    updated: 'October 2026',
    content: `
      <h2>Deposit payments</h2>
      <p>For pre-order items you can choose <strong>Pay deposit</strong> at checkout and pay a percentage of the total now. The exact deposit amount and the remaining balance are shown before you confirm.</p>
      <h3>Paying the balance</h3>
      <ul>
        <li>Your confirmation email includes a <strong>Pay balance</strong> link</li>
        <li>Signed-in customers also see a <strong>Pay Balance</strong> button in <a href="/account?tab=orders">Order History</a></li>
        <li>Orders ship once the balance is paid and the stock has arrived</li>
      </ul>
      <p>If you need help settling a balance, <a href="/support/ticket">open a ticket</a> with your order number.</p>
    `,
  },
  {
    id: '17',
    title: 'I forgot my password',
    category: 'account',
    updated: 'October 2026',
    content: `
      <h2>Resetting your password</h2>
      <ol>
        <li>Go to <a href="/auth/forgot-password">Forgot password</a></li>
        <li>Enter the email address you signed up with</li>
        <li>Open the email we send and click the reset link (it expires after 1 hour)</li>
        <li>Choose a new password of at least 8 characters</li>
      </ol>
      <p>If the email does not arrive within a few minutes, check your spam folder and make sure you entered the address you registered with. You can request a new link at any time.</p>
      <p>Already signed in? Change your password from the <a href="/account?tab=security">Security</a> tab of your account.</p>
    `,
  },
  {
    id: '19',
    title: 'Can I delete my account?',
    category: 'account',
    updated: 'October 2026',
    content: `
      <h2>Deleting your account</h2>
      <p>Yes. Sign in and open <a href="/account/privacy">Privacy &amp; Data</a>. From there you can:</p>
      <ul>
        <li><strong>Download your data</strong> — a JSON file with your profile, orders and addresses</li>
        <li><strong>Request account deletion</strong> — this opens a support ticket; we confirm by email within 2 business days before removing anything</li>
      </ul>
      <p>Order records are kept for accounting but are unlinked from your profile once the deletion is complete.</p>
    `,
  },
  {
    id: '20',
    title: 'How do I manage my addresses?',
    category: 'account',
    updated: 'October 2026',
    content: `
      <h2>Saved addresses</h2>
      <p>Sign in and open the <a href="/account?tab=addresses">Addresses</a> tab of your account. You can add as many addresses as you like, edit or delete them, and mark one as the default.</p>
      <p>Include a landmark in the second address line — riders find you faster that way — and make sure the phone number is one you will answer on delivery day.</p>
    `,
  },
  {
    id: '31',
    title: 'How do I contact AbbyGlow?',
    category: 'contact',
    updated: 'October 2026',
    content: `
      <h2>Getting in touch</h2>
      <ul>
        <li><strong>WhatsApp or phone:</strong> fastest for anything about a live order — numbers are on the <a href="/contact">Contact</a> page</li>
        <li><strong>Support ticket:</strong> <a href="/support/ticket">open a ticket</a> and we reply by email within 24 hours; signed-in customers can follow it under <a href="/support/tickets">My Tickets</a></li>
        <li><strong>Contact form:</strong> for general questions, use the form on the <a href="/contact">Contact</a> page</li>
      </ul>
      <p>Please include your order number whenever your question is about an order.</p>
    `,
  },
];

export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

export function getRelatedArticles(article: HelpArticle, limit = 4): HelpArticle[] {
  const sameCategory = HELP_ARTICLES.filter((a) => a.category === article.category && a.id !== article.id);
  const others = HELP_ARTICLES.filter((a) => a.category !== article.category);
  return [...sameCategory, ...others].slice(0, limit);
}

export const POPULAR_ARTICLE_IDS = ['1', '6', '11', '2', '17'];
