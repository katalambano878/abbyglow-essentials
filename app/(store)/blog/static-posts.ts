/**
 * Fallback articles shown when the blog_posts table has no published rows.
 * Content is trusted static HTML authored in-repo; it is still passed through
 * sanitizeHtml() before rendering.
 */
export interface StaticPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  category: string;
  date: string;
  isoDate: string;
  readTime: string;
  author: string;
  content: string;
}

const RAW: Record<string, { title: string; image: string; category: string; date: string; readTime: string; author: string; content: string }> = {
  '1': {
    title: 'The Ultimate Guide to Online Shopping in Ghana',
    image: '/blog-hero.png',
    category: 'Shopping Tips',
    date: 'December 15, 2024',
    readTime: '8 min read',
    author: 'Staff Writer',
    content: `
      <p>Online shopping has revolutionised the way Ghanaians purchase products, offering convenience, variety, and competitive prices. However, navigating the world of ecommerce can be daunting if you're new to it. This comprehensive guide will help you shop online safely and confidently.</p>

      <h2>Why Shop Online in Ghana?</h2>
      <p>The benefits of online shopping are numerous. You can browse thousands of products from the comfort of your home, compare prices easily, read reviews from other customers, and have items delivered directly to your doorstep. For busy professionals and families, online shopping saves valuable time.</p>

      <p>Moreover, online stores often offer exclusive deals and promotions that aren't available in physical shops. You can shop at any time of day or night, without worrying about store opening hours or traffic.</p>

      <h2>Choosing a Reliable Online Store</h2>
      <p>Not all online stores are created equal. When shopping online, look for these trust signals:</p>
      <ul>
        <li><strong>Secure website:</strong> The URL should start with "https://" and display a padlock icon</li>
        <li><strong>Clear contact information:</strong> Phone numbers, email addresses, and physical address should be visible</li>
        <li><strong>Customer reviews:</strong> Real testimonials from verified buyers</li>
        <li><strong>Return policy:</strong> Clear terms for returns and refunds</li>
        <li><strong>Professional design:</strong> Well-organised website with detailed product information</li>
      </ul>

      <h2>Payment Methods in Ghana</h2>
      <p>Ghanaian online shoppers have several secure payment options:</p>
      <ul>
        <li><strong>Mobile Money:</strong> MTN, Vodafone, and AirtelTigo offer convenient payment options</li>
        <li><strong>Credit/Debit Cards:</strong> Visa and Mastercard are widely accepted</li>
        <li><strong>Moolre Payment:</strong> Our integrated payment gateway for seamless mobile money and card payments</li>
      </ul>

      <p>Always ensure you're on a secure connection when entering payment details. Avoid using public Wi-Fi for transactions.</p>

      <h2>Understanding Delivery Options</h2>
      <p>Delivery times and costs vary by location. In Accra and major cities, you can often get next-day delivery. Remote areas may take longer. Always check:</p>
      <ul>
        <li>Estimated delivery time for your location</li>
        <li>Delivery costs (many stores offer free shipping above a certain amount)</li>
        <li>Tracking availability</li>
        <li>What happens if you're not home for delivery</li>
      </ul>

      <h2>Tips for Safe Online Shopping</h2>
      <ol>
        <li><strong>Research the seller:</strong> Check reviews and ratings before purchasing</li>
        <li><strong>Read product descriptions carefully:</strong> Note sizes, colours, materials, and specifications</li>
        <li><strong>Save confirmation emails:</strong> Keep records of your orders and payment</li>
        <li><strong>Check return policies:</strong> Understand your options if the product isn't suitable</li>
        <li><strong>Use strong passwords:</strong> Create unique passwords for shopping accounts</li>
        <li><strong>Monitor your accounts:</strong> Check bank statements for unauthorised charges</li>
        <li><strong>Be wary of deals that seem too good to be true:</strong> Scammers often lure victims with unrealistic discounts</li>
      </ol>

      <h2>What to Do If Something Goes Wrong</h2>
      <p>Despite best efforts, issues can arise. If you receive the wrong item, a damaged product, or don't receive your order at all:</p>
      <ul>
        <li>Contact the seller immediately with photos and order details</li>
        <li>Most reputable stores will offer a replacement or refund</li>
        <li>If the store is unresponsive, contact your bank or mobile money provider</li>
        <li>Report fraudulent sellers to relevant authorities</li>
      </ul>

      <h2>Making the Most of Online Shopping</h2>
      <p>To enhance your online shopping experience:</p>
      <ul>
        <li>Sign up for newsletters to get exclusive deals and early access to sales</li>
        <li>Use wishlists to save items you're interested in</li>
        <li>Follow your favourite stores on social media for flash sales</li>
        <li>Take advantage of loyalty programmes and reward points</li>
        <li>Shop during major sales events like Black Friday for better prices</li>
      </ul>

      <h2>Conclusion</h2>
      <p>Online shopping in Ghana is safe, convenient, and increasingly popular. By following these guidelines, you can enjoy all the benefits whilst minimising risks. Start with small purchases from reputable stores to build confidence, and soon you'll wonder how you ever lived without the convenience of online shopping.</p>

      <p>Happy shopping!</p>
    `
  },
  '2': {
    title: '10 Must-Have Products for Your Home This Season',
    image: '/blog-hero.png',
    category: 'Home & Living',
    date: 'December 12, 2024',
    readTime: '6 min read',
    author: 'Staff Writer',
    content: `
      <p>Transform your living space with these carefully selected must-have products. Whether you're refreshing your décor or starting from scratch, these items will elevate your home's comfort and style.</p>

      <h2>1. Smart LED Lighting</h2>
      <p>Modern LED bulbs with adjustable brightness and colour temperature can dramatically change your home's ambience. Control them from your phone, set schedules, and reduce energy costs.</p>

      <h2>2. Premium Bedding Set</h2>
      <p>Invest in quality sheets, duvet covers, and pillows. Good sleep is essential, and premium bedding makes a noticeable difference. Look for breathable fabrics suitable for Ghana's climate.</p>

      <h2>3. Air Purifier</h2>
      <p>With increasing air quality concerns, an air purifier removes dust, pollen, and pollutants, creating a healthier indoor environment for your family.</p>

      <h2>4. Organisational Storage Solutions</h2>
      <p>Declutter your space with stylish storage boxes, baskets, and shelving units. A well-organised home feels more spacious and serene.</p>

      <h2>5. Indoor Plants</h2>
      <p>Bring nature indoors with low-maintenance plants like snake plants or pothos. They purify air, add visual interest, and create a calming atmosphere.</p>

      <h2>6. Quality Cookware Set</h2>
      <p>Upgrade your kitchen with durable pots and pans. Quality cookware distributes heat evenly, lasts longer, and makes cooking more enjoyable.</p>

      <h2>7. Comfortable Throw Pillows</h2>
      <p>Instantly refresh your living room or bedroom with decorative throw pillows. Mix textures and colours to create visual interest.</p>

      <h2>8. Smart Power Strip</h2>
      <p>Protect your electronics and reduce energy waste with a smart power strip that cuts power to devices in standby mode.</p>

      <h2>9. Bath Towel Set</h2>
      <p>Luxury doesn't have to be expensive. A set of soft, absorbent towels in coordinating colours makes your bathroom feel like a spa.</p>

      <h2>10. Decorative Mirror</h2>
      <p>Mirrors make spaces feel larger and brighter by reflecting light. Choose a statement piece that complements your décor style.</p>

      <h2>Shopping Smart</h2>
      <p>When purchasing home products, consider quality over quantity. It's better to invest in a few well-made items than many cheap ones that won't last. Read reviews, compare prices, and take advantage of seasonal sales.</p>

      <p>Start with the essentials and gradually build your collection. Your home should reflect your personality and meet your practical needs.</p>
    `
  },
  '3': {
    title: 'How to Choose Quality Products: A Buyer\'s Guide',
    image: '/blog-hero.png',
    category: 'Buying Guide',
    date: 'December 10, 2024',
    readTime: '7 min read',
    author: 'Staff Writer',
    content: `
      <p>In a market flooded with options, choosing quality products can be challenging. This guide will help you identify genuine quality and make purchasing decisions you won't regret.</p>

      <h2>Understanding Quality Indicators</h2>
      <p>Quality isn't just about price. A well-made product offers durability, functionality, and value for money. Here's what to look for:</p>

      <h3>Material Quality</h3>
      <p>Examine the materials used. Natural fibres, solid wood, stainless steel, and durable plastics indicate better quality. Avoid products that feel flimsy or have a chemical smell.</p>

      <h3>Construction and Craftsmanship</h3>
      <p>Check seams, joints, and finishes. Quality products have neat stitching, smooth edges, and secure fastenings. Poor construction is evident in loose threads, uneven surfaces, and wobbly parts.</p>

      <h3>Brand Reputation</h3>
      <p>Established brands invest in quality control and customer satisfaction. Research brands before purchasing. Read reviews and check how they handle complaints.</p>

      <h2>Reading Product Descriptions</h2>
      <p>Detailed product descriptions are a good sign. Quality sellers provide:</p>
      <ul>
        <li>Precise dimensions and specifications</li>
        <li>Material composition</li>
        <li>Care instructions</li>
        <li>Warranty information</li>
        <li>Multiple clear photos from different angles</li>
      </ul>

      <h2>The Power of Reviews</h2>
      <p>Customer reviews are invaluable. Look for:</p>
      <ul>
        <li>Verified purchase badges</li>
        <li>Detailed feedback with photos</li>
        <li>Recent reviews (product quality can change)</li>
        <li>How sellers respond to negative reviews</li>
        <li>Overall rating trends</li>
      </ul>

      <p>Be sceptical of products with only perfect 5-star reviews or very few reviews relative to sales.</p>

      <h2>Price vs. Value</h2>
      <p>Expensive doesn't always mean quality, and cheap isn't always poor. Consider:</p>
      <ul>
        <li><strong>Cost per use:</strong> A GHS 200 item used daily for 5 years offers better value than a GHS 50 item replaced yearly</li>
        <li><strong>Warranty and guarantees:</strong> Quality manufacturers stand behind their products</li>
        <li><strong>Maintenance costs:</strong> Some cheap items require expensive upkeep</li>
        <li><strong>Resale value:</strong> Quality items retain value better</li>
      </ul>

      <h2>Red Flags to Avoid</h2>
      <p>Watch out for these warning signs:</p>
      <ul>
        <li>Vague or missing product information</li>
        <li>No return policy or unclear terms</li>
        <li>Prices significantly below market average</li>
        <li>Poor website quality and numerous spelling errors</li>
        <li>Lack of contact information</li>
        <li>Pressure tactics urging immediate purchase</li>
        <li>No physical address or company details</li>
      </ul>

      <h2>Category-Specific Tips</h2>

      <h3>Electronics</h3>
      <ul>
        <li>Check for official warranty from manufacturer</li>
        <li>Verify authenticity through serial numbers</li>
        <li>Compare specifications carefully</li>
        <li>Research common issues with the model</li>
      </ul>

      <h3>Clothing and Textiles</h3>
      <ul>
        <li>Natural fibres often last longer</li>
        <li>Check fabric weight (heavier usually means quality)</li>
        <li>Examine stitching and seams</li>
        <li>Verify colour fastness information</li>
      </ul>

      <h3>Furniture</h3>
      <ul>
        <li>Solid wood beats particle board</li>
        <li>Test weight capacity</li>
        <li>Check joinery methods</li>
        <li>Assess cushion density and spring quality</li>
      </ul>

      <h2>Making the Final Decision</h2>
      <p>Before clicking "buy," ask yourself:</p>
      <ol>
        <li>Do I need this product?</li>
        <li>Have I researched alternatives?</li>
        <li>Is this the right time to buy? (sales, seasons)</li>
        <li>Can I afford it without financial strain?</li>
        <li>Does it meet my quality standards?</li>
        <li>What's the return policy if I'm unsatisfied?</li>
      </ol>

      <h2>After Purchase</h2>
      <p>Protect your investment:</p>
      <ul>
        <li>Inspect items immediately upon delivery</li>
        <li>Keep packaging until you're certain you'll keep it</li>
        <li>Register warranties</li>
        <li>Follow care instructions</li>
        <li>Leave honest reviews to help other shoppers</li>
      </ul>

      <h2>Conclusion</h2>
      <p>Choosing quality products requires research, patience, and critical thinking. Don't rush important purchases. Take time to compare options, read reviews, and verify seller credibility. Quality products cost more upfront but offer better value long-term through durability, performance, and satisfaction.</p>

      <p>Remember: the bitterness of poor quality lingers long after the sweetness of a low price is forgotten.</p>
    `
  }
};

const META: Record<string, { excerpt: string; isoDate: string }> = {
  '1': {
    excerpt: 'Everything you need to know about safe, convenient online shopping in Ghana. From payment methods to delivery options, we cover it all.',
    isoDate: '2024-12-15',
  },
  '2': {
    excerpt: 'Discover the trending products that will elevate your living space and make your home more comfortable and stylish.',
    isoDate: '2024-12-12',
  },
  '3': {
    excerpt: "Learn the key indicators of quality products and how to make informed purchasing decisions that offer the best value for your money.",
    isoDate: '2024-12-10',
  },
};

export const STATIC_POSTS: StaticPost[] = Object.entries(RAW).map(([id, p]) => ({
  id,
  slug: id,
  ...p,
  excerpt: META[id]?.excerpt ?? '',
  isoDate: META[id]?.isoDate ?? '2024-12-01',
}));

export function getStaticPost(idOrSlug: string): StaticPost | undefined {
  return STATIC_POSTS.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}
