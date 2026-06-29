// Shared, presentational body of the Robotics Club Credit Card Access and Usage
// Agreement.
//
// Rendered both in the authorized user's signing page (app/dashboard/credit-card)
// and in the Financial Officer / admin review page
// (app/dashboard/credit-card/approve/[userId]) so the on-screen copy is identical
// in both places. This is read-only / presentational — no inputs. The interactive
// signature lives in the surrounding page, right after this body.
//
// The $1,000 Financial Officer approval threshold in §3 is part of the agreed
// text and is intentionally hard-coded here.

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  margin: '1.6rem 0 0.5rem',
  color: '#171414'
};

const subHeadingStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  margin: '1.1rem 0 0.45rem',
  color: '#171414'
};

const listStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  paddingLeft: '1.2rem',
  lineHeight: 1.7
};

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 0.6rem'
};

export function CreditCardAgreementBody() {
  return (
    <section style={{ lineHeight: 1.75, color: '#231f20' }}>
      <h1 style={{ fontSize: '1.6rem', lineHeight: 1.3, fontWeight: 800, margin: '0 0 1rem' }}>
        Robotics Club Credit Card Access and Usage Agreement
      </h1>

      <p style={paragraphStyle}>
        Credit card access is a revocable privilege granted solely to support authorized Robotics
        Club activities. It is based on a high degree of trust and carries a duty to protect club
        and student funds. Card access does not authorize a team lead to make independent financial
        commitments outside an approved budget.
      </p>

      <h2 style={sectionHeadingStyle}>1. Compliance and Order of Authority</h2>
      <p style={paragraphStyle}>All purchases must comply with:</p>
      <ol style={listStyle}>
        <li>Stanford University policies;</li>
        <li>ASSU, SSE, OSE, and applicable funding policies;</li>
        <li>The Robotics Club budget and financial policies;</li>
        <li>This Agreement; and</li>
        <li>
          Any additional instructions issued by the Club President, Financial Officer, or authorized
          Stanford administrator.
        </li>
      </ol>
      <p style={paragraphStyle}>
        Where these requirements conflict, the stricter requirement applies unless an authorized
        Stanford administrator directs otherwise.
      </p>

      <h2 style={sectionHeadingStyle}>2. Authorized Users and Card Security</h2>
      <p style={paragraphStyle}>
        Card access may only be used by a person who has been individually authorized by the
        Robotics Club. Authorized users may not:
      </p>
      <ul style={listStyle}>
        <li>Share card numbers, account credentials, one-time security codes, or digital-wallet access;</li>
        <li>Permit another person to use their assigned credentials;</li>
        <li>
          Photograph or store card details in unsecured notes, messages, spreadsheets, or personal
          password managers;
        </li>
        <li>
          Save the card to a personal Amazon, PayPal, Apple, Google, vendor, or other purchasing
          account without written approval; or
        </li>
        <li>Leave a physical card unattended or accessible to unauthorized individuals.</li>
      </ul>
      <p style={paragraphStyle}>
        Card details may be stored only in approved club-controlled purchasing systems.
      </p>

      <h2 style={sectionHeadingStyle}>3. Purchase Authorization</h2>
      <p style={paragraphStyle}>A purchase may be made only when:</p>
      <ul style={listStyle}>
        <li>It serves a legitimate and documented Robotics Club purpose;</li>
        <li>Sufficient funds remain in the team&rsquo;s approved allocation;</li>
        <li>The expense falls within an approved budget category or line item;</li>
        <li>Any required funding approval has already been received; and</li>
        <li>The purchase complies with Stanford and ASSU restrictions.</li>
      </ul>
      <p style={paragraphStyle}>
        Written approval from the Club Financial Officer is required before:
      </p>
      <ul style={listStyle}>
        <li>Any purchase over $1,000;</li>
        <li>Any purchase outside an approved budget line;</li>
        <li>Any recurring subscription or free trial requiring payment information;</li>
        <li>Any purchase involving a contract, deposit, cancellation fee, or continuing obligation;</li>
        <li>Any purchase from an international or unfamiliar vendor;</li>
        <li>Any delivery to a non-Stanford address;</li>
        <li>Any transaction involving a team lead, family member, friend, or affiliated business; or</li>
        <li>Any unusual expense for which eligibility is uncertain.</li>
      </ul>
      <p style={paragraphStyle}>Silence or lack of response does not constitute approval.</p>

      <h2 style={sectionHeadingStyle}>4. Three-Day Logging Requirement</h2>
      <p style={paragraphStyle}>
        Every purchase must be entered into the club&rsquo;s designated transaction log within three
        calendar days of the transaction date, even if the transaction is still pending on the card
        statement.
      </p>
      <p style={paragraphStyle}>The entry must include:</p>
      <ul style={listStyle}>
        <li>Transaction date;</li>
        <li>Merchant;</li>
        <li>Total amount, including tax and shipping;</li>
        <li>Team and purchaser;</li>
        <li>Project, event, or operational purpose;</li>
        <li>Approved budget category or line item;</li>
        <li>Itemized description of what was purchased;</li>
        <li>Itemized receipt or paid invoice;</li>
        <li>Applicable written approval;</li>
        <li>Delivery destination;</li>
        <li>Names of attendees or beneficiaries when required for food, travel, or event expenses; and</li>
        <li>Asset or inventory information when equipment was purchased.</li>
      </ul>
      <p style={paragraphStyle}>
        A card statement, order confirmation showing only the total, or credit card slip is not an
        itemized receipt unless it identifies each item or service purchased.
      </p>
      <p style={paragraphStyle}>
        Failure to log a transaction within three calendar days may result in immediate suspension
        of the user&rsquo;s purchasing access and additional consequences based on the frequency or
        severity of the violation.
      </p>

      <h2 style={sectionHeadingStyle}>5. Reconciliation Deadline and Team Suspension</h2>
      <p style={paragraphStyle}>
        All transactions and supporting documents must be complete by the reconciliation deadline
        announced by the Club Financial Officer.
      </p>
      <p style={paragraphStyle}>
        If any transaction lacks an acceptable receipt or required documentation at the
        reconciliation deadline:
      </p>
      <ul style={listStyle}>
        <li>All credit card purchasing access for the responsible team will be suspended;</li>
        <li>No member of the team may use another team&rsquo;s access to bypass the suspension;</li>
        <li>
          Suspension will remain in effect until the documentation issue is resolved and access is
          affirmatively restored by the Club Financial Officer; and
        </li>
        <li>
          Repeated or serious violations may result in a longer suspension, revocation of the team
          lead&rsquo;s access, reduction of the team&rsquo;s discretionary purchasing authority, or
          referral to the appropriate Stanford or ASSU authority.
        </li>
      </ul>
      <p style={paragraphStyle}>
        This team-level suspension applies because each team is responsible for establishing
        internal processes that ensure its purchases are documented on time.
      </p>

      <h2 style={sectionHeadingStyle}>6. Missing Receipts</h2>
      <p style={paragraphStyle}>
        The purchaser must first make a good-faith effort to obtain a replacement receipt or invoice
        from the vendor.
      </p>
      <p style={paragraphStyle}>A Missing Receipt Declaration may be accepted only when:</p>
      <ul style={listStyle}>
        <li>A replacement cannot reasonably be obtained;</li>
        <li>The declaration is submitted before the reconciliation deadline;</li>
        <li>
          It contains the date, vendor, amount, items purchased, club purpose, and explanation for
          the missing receipt;
        </li>
        <li>The purchaser certifies that no personal items were included; and</li>
        <li>The Club Financial Officer approves the declaration.</li>
      </ul>
      <p style={paragraphStyle}>
        A Missing Receipt Declaration is an exception, not a substitute for ordinary receipt
        retention. More than one missing receipt by the same purchaser or team in a quarter may
        result in suspension, even when declarations are submitted.
      </p>

      <h2 style={sectionHeadingStyle}>7. Prohibited Transactions</h2>
      <p style={paragraphStyle}>The card may not be used for:</p>
      <ul style={listStyle}>
        <li>Personal purchases, even when the purchaser intends to repay the club;</li>
        <li>Cash advances, cash withdrawals, money orders, cryptocurrency, or peer-to-peer transfers;</li>
        <li>Gift cards, prepaid cards, or cash-equivalent instruments;</li>
        <li>Alcohol, cannabis, controlled substances, tobacco, or nicotine products;</li>
        <li>Donations, political contributions, or charitable transfers;</li>
        <li>Parking citations, fines, penalties, avoidable late fees, or personal membership fees;</li>
        <li>Personal clothing, electronics, food, travel, lodging, or other personal benefits;</li>
        <li>Leadership-only gifts, meals, apparel, or recognition items;</li>
        <li>Purchases made before funding or budget approval;</li>
        <li>Purchases from an unauthorized funding category;</li>
        <li>Items available through an appropriate Stanford borrowing program, unless an exception is approved;</li>
        <li>Software for which an adequate Stanford-provided or free alternative exists;</li>
        <li>
          Any transaction intended to circumvent Stanford, ASSU, vendor-selection, tax, safety,
          travel, or procurement requirements; or
        </li>
        <li>Any illegal, unsafe, misleading, or reputationally harmful purchase.</li>
      </ul>
      <p style={paragraphStyle}>
        A cardholder may not mix personal and club items in the same order.
      </p>

      <h3 style={subHeadingStyle}>Prohibited Vendors, Services, and Payment Methods</h3>
      <p style={paragraphStyle}>
        The club credit card may not be used for any of the following vendors, services, merchant
        categories, or payment methods: Venmo, Cash App, Zelle, Apple Cash, Google Pay
        person-to-person transfers, PayPal Friends and Family, Wise transfers to individuals, Western
        Union, MoneyGram, wire transfers to individuals, cryptocurrency exchanges, cryptocurrency
        purchases, cash advances, ATM withdrawals, money orders, traveler&rsquo;s checks, prepaid
        debit cards, reloadable payment cards, gift cards, Amazon gift cards, Apple gift cards, Google
        Play gift cards, Visa gift cards, Mastercard gift cards, restaurant gift cards, retail gift
        cards, store credit purchased for later use, gaming currency, virtual currency, cash-equivalent
        products, liquor stores, bars, nightclubs, alcohol-delivery services, cannabis dispensaries,
        vape shops, tobacco retailers, controlled-substance vendors, gambling websites, casinos,
        sportsbooks, online betting platforms, fantasy-sports wagering services, lottery vendors,
        monetary prediction markets, political campaigns, political parties, political action
        committees, candidate committees, charitable-donation platforms, crowdfunding donations,
        GoFundMe, ActBlue, WinRed, personal fundraisers, dating services, adult-entertainment
        services, pornographic-content vendors, escort services, personal grooming services, personal
        fitness memberships, personal medical expenses, academic-cheating services, impersonation
        services, counterfeit-goods vendors, stolen-property vendors, pirated-software vendors,
        unauthorized media vendors, vendors attempting to evade taxes, customs requirements,
        sanctions, export controls, or applicable law, firearms vendors, ammunition vendors, weapons
        vendors, explosive vendors, fireworks vendors, vendors selling products primarily intended as
        personal-defense weapons, individual students, club members, team leads, friends, family
        members, personal bank accounts, personal payment accounts, sellers who cannot provide an
        itemized invoice, sellers who cannot provide a verifiable identity or delivery record, vendors
        requesting payment outside their normal checkout system, and any vendor or service used
        primarily for personal benefit rather than an authorized Robotics Club purpose.
      </p>
      <p style={paragraphStyle}>
        The club credit card also may not be used for non-essential software, artificial-intelligence
        services, productivity tools, chatbots, generative-AI products, premium consumer
        applications, or similar online services, including Claude, ChatGPT, Gemini, DeepSeek,
        Perplexity, Grok, Copilot, Midjourney, Runway, Character.AI, Poe, Notion AI, Grammarly
        Premium, Canva Pro, Adobe consumer subscriptions, individual cloud-storage upgrades,
        individual coding-assistant subscriptions, or any substantially similar service, unless all of
        the following conditions are met: the service is necessary for a documented club project, no
        adequate Stanford-provided or free alternative exists, the purchase has received prior written
        approval from the Club Financial Officer, and the charge is paid entirely from sponsored,
        externally restricted, or otherwise specifically designated funding whose terms expressly
        permit that expense.
      </p>
      <p style={paragraphStyle}>
        The existence of sponsored funding does not by itself authorize a purchase. The purchase must
        remain within the sponsor&rsquo;s written funding restrictions, applicable Stanford policies,
        and the approved project budget. General ASSU, student-fee, or unrestricted club funds may not
        be used for non-essential software or artificial-intelligence subscriptions.
      </p>
      <p style={paragraphStyle}>
        This list is non-exhaustive. A transaction remains prohibited when its underlying purpose
        falls within a prohibited category, even if the specific vendor, payment processor, merchant
        name, or service is not listed above.
      </p>

      <h2 style={sectionHeadingStyle}>8. No Transaction Splitting</h2>
      <p style={paragraphStyle}>
        A purchase may not be divided into multiple transactions, orders, invoices, cards,
        purchasers, or dates for the purpose of:
      </p>
      <ul style={listStyle}>
        <li>Avoiding a transaction limit;</li>
        <li>Avoiding an approval requirement;</li>
        <li>Avoiding a quote or competitive-pricing requirement;</li>
        <li>Staying within a budget category that would otherwise be exceeded; or</li>
        <li>Concealing the total cost of a project or commitment.</li>
      </ul>
      <p style={paragraphStyle}>
        Related purchases from the same vendor for the same project must be treated as one purchase
        when determining approval requirements.
      </p>

      <h2 style={sectionHeadingStyle}>9. Software, Online Services, and Subscriptions</h2>
      <p style={paragraphStyle}>
        All software, hosting, cloud services, domains, paid accounts, and subscriptions require
        prior written approval.
      </p>
      <p style={paragraphStyle}>Before approval, the requester must document:</p>
      <ul style={listStyle}>
        <li>Why the service is necessary;</li>
        <li>Whether Stanford already provides an adequate alternative;</li>
        <li>Whether a free or lower-cost plan is available;</li>
        <li>The billing frequency and total expected cost;</li>
        <li>The account owner and operational point of contact;</li>
        <li>The renewal date and cancellation deadline;</li>
        <li>
          Whether data, source code, payment information, or club records will be stored with the
          service; and
        </li>
        <li>How access will be transferred when leadership changes.</li>
      </ul>
      <p style={paragraphStyle}>Subscriptions must:</p>
      <ul style={listStyle}>
        <li>Use a club-controlled email address and account;</li>
        <li>Be entered in the club&rsquo;s subscription register;</li>
        <li>Have automatic renewal disabled unless continuing renewal is specifically approved;</li>
        <li>Avoid multi-year commitments unless separately approved;</li>
        <li>Be reviewed at least once per quarter;</li>
        <li>Be cancelled promptly when no longer needed; and</li>
        <li>Be transferred to incoming leadership before the responsible student leaves their role.</li>
      </ul>
      <p style={paragraphStyle}>
        Free trials may not be started with the card unless the resulting subscription has already
        been approved. Forgetting to cancel a trial or subscription is not an acceptable use of club
        funds.
      </p>

      <h2 style={sectionHeadingStyle}>10. Vendor Accounts, Rewards, and Personal Benefits</h2>
      <p style={paragraphStyle}>
        Club purchases must not generate a personal benefit for the purchaser.
      </p>
      <p style={paragraphStyle}>Purchasers may not:</p>
      <ul style={listStyle}>
        <li>Use personal referral or affiliate links;</li>
        <li>
          Direct rebates, promotional credits, rewards, points, cashback, or gift balances to a
          personal account;
        </li>
        <li>Select a vendor because of a personal benefit;</li>
        <li>Use a personal loyalty account when a club-controlled account is reasonably available; or</li>
        <li>Retain vendor credits arising from a club purchase.</li>
      </ul>
      <p style={paragraphStyle}>
        Any reward, credit, refund, or promotional value associated with a club purchase belongs to
        the club or applicable funding authority.
      </p>

      <h2 style={sectionHeadingStyle}>11. Shipping and Delivery</h2>
      <p style={paragraphStyle}>
        Purchases should be delivered to an approved Stanford or club-controlled location.
      </p>
      <p style={paragraphStyle}>
        Delivery to a residence, dorm room, hotel, or other personal address requires prior written
        approval and must be justified by operational necessity. The recipient must promptly confirm
        delivery and transfer the item to approved club storage.
      </p>
      <p style={paragraphStyle}>
        The purchaser is responsible for tracking delayed, missing, or damaged shipments and
        documenting any replacement or refund.
      </p>

      <h2 style={sectionHeadingStyle}>12. Returns, Refunds, and Credits</h2>
      <p style={paragraphStyle}>
        Refunds must be returned to the same credit card used for the original purchase.
      </p>
      <p style={paragraphStyle}>Purchasers may not:</p>
      <ul style={listStyle}>
        <li>Accept a cash refund for a card purchase;</li>
        <li>Direct a refund to a personal card or account;</li>
        <li>Retain store credit for personal use; or</li>
        <li>Dispose of, sell, or exchange club property without approval.</li>
      </ul>
      <p style={paragraphStyle}>
        Returns, refunds, credits, cancellations, and disputes must be entered in the transaction
        log within three calendar days.
      </p>

      <h2 style={sectionHeadingStyle}>13. Equipment and Inventory</h2>
      <p style={paragraphStyle}>
        All equipment and durable supplies purchased with club or ASSU funds are organizational
        property and not the personal property of the purchaser or team lead.
      </p>
      <p style={paragraphStyle}>Equipment records must include, when applicable:</p>
      <ul style={listStyle}>
        <li>Item description;</li>
        <li>Purchase date and cost;</li>
        <li>Serial number;</li>
        <li>Asset tag;</li>
        <li>Team;</li>
        <li>Current custodian;</li>
        <li>Storage location; and</li>
        <li>Condition.</li>
      </ul>
      <p style={paragraphStyle}>
        Equipment may not be permanently stored in a personal residence. Items must be returned to
        approved club or ASSU storage when required, including at the end of the academic year or
        leadership term.
      </p>

      <h2 style={sectionHeadingStyle}>14. Conflicts of Interest</h2>
      <p style={paragraphStyle}>
        A purchaser must disclose any personal, financial, employment, family, or close relationship
        with a proposed vendor.
      </p>
      <p style={paragraphStyle}>
        No person may approve their own related-party transaction. Purchases from a student, team
        member, officer, family member, friend, or business connected to a club member require
        written review and approval before any commitment is made.
      </p>

      <h2 style={sectionHeadingStyle}>15. Contracts and Commitments</h2>
      <p style={paragraphStyle}>
        Credit card access does not authorize a team lead to sign contracts, agree to multi-year
        commitments, approve indemnification terms, open credit accounts, or otherwise legally bind
        the Robotics Club, ASSU, or Stanford University.
      </p>
      <p style={paragraphStyle}>
        Any vendor agreement, custom order, deposit, cancellation obligation, or continuing
        commitment must be reviewed through the appropriate approval process before payment.
      </p>

      <h2 style={sectionHeadingStyle}>16. Lost Cards, Fraud, and Security Incidents</h2>
      <p style={paragraphStyle}>
        A lost or stolen card, exposed card number, suspicious charge, phishing attempt, or
        compromised vendor account must be reported immediately to the Club Financial Officer.
      </p>
      <p style={paragraphStyle}>
        The user must not wait to determine whether misuse actually occurred. The card should be
        locked or cancelled as soon as practicable, and the purchaser must assist with any dispute,
        fraud report, or replacement process.
      </p>
      <p style={paragraphStyle}>
        Failure to promptly report a security incident may itself result in loss of access.
      </p>

      <h2 style={sectionHeadingStyle}>17. Independent Review and Audit</h2>
      <p style={paragraphStyle}>
        A purchaser may not be the sole approver of their own transactions.
      </p>
      <p style={paragraphStyle}>
        The Club Financial Officer or another authorized reviewer who did not make the purchase will
        periodically verify:
      </p>
      <ul style={listStyle}>
        <li>Business purpose;</li>
        <li>Receipt and documentation;</li>
        <li>Budget availability;</li>
        <li>Required approvals;</li>
        <li>Proper expense category;</li>
        <li>Delivery and inventory records;</li>
        <li>Refunds and credits; and</li>
        <li>Compliance with this Agreement.</li>
      </ul>
      <p style={paragraphStyle}>
        The club may conduct random audits and request further documentation at any time.
      </p>

      <h2 style={sectionHeadingStyle}>18. Unauthorized Purchases and Responsibility</h2>
      <p style={paragraphStyle}>
        An individual who makes a personal, prohibited, unapproved, or materially undocumented
        purchase may be required to reimburse the applicable amount to the extent permitted by
        Stanford and ASSU policy.
      </p>
      <p style={paragraphStyle}>Unauthorized use may also result in:</p>
      <ul style={listStyle}>
        <li>Immediate card suspension;</li>
        <li>Permanent revocation of purchasing access;</li>
        <li>Removal from a financial or leadership role;</li>
        <li>Suspension of the responsible team&rsquo;s purchasing access;</li>
        <li>Reduction or cancellation of the team&rsquo;s budget;</li>
        <li>Referral to ASSU, SSE, OSE, Stanford administrators, or other appropriate authorities; and</li>
        <li>Any additional action available under applicable university policy.</li>
      </ul>
      <p style={paragraphStyle}>
        Repayment does not automatically cure or excuse unauthorized use.
      </p>

      <h2 style={sectionHeadingStyle}>19. Leadership Transition and Termination of Access</h2>
      <p style={paragraphStyle}>Card access ends immediately when a user:</p>
      <ul style={listStyle}>
        <li>Leaves or is removed from their leadership role;</li>
        <li>Graduates, withdraws, or takes a leave of absence;</li>
        <li>Is no longer responsible for club purchasing;</li>
        <li>Fails to complete required training or reconciliation; or</li>
        <li>Is notified that access has been suspended or revoked.</li>
      </ul>
      <p style={paragraphStyle}>
        Departing users must transfer all receipts, vendor accounts, subscriptions, credentials,
        order histories, and outstanding transaction information. Saved card information must be
        removed from accounts they continue to control.
      </p>

      <h2 style={sectionHeadingStyle}>20. Certification</h2>
      <p style={paragraphStyle}>By signing below, I certify that:</p>
      <ul style={listStyle}>
        <li>I have read and understand this Agreement;</li>
        <li>I understand that card access is a revocable privilege;</li>
        <li>I will use the card only for properly authorized club purposes;</li>
        <li>I will log every transaction and provide all required documentation on time;</li>
        <li>I will protect card and account information;</li>
        <li>
          I will disclose mistakes, missing documentation, suspected fraud, and conflicts of
          interest promptly; and
        </li>
        <li>
          I understand that violations may affect both my access and my entire team&rsquo;s ability
          to make purchases.
        </li>
      </ul>
    </section>
  );
}
