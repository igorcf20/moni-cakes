// Other countries (en): a general, cautious text. Local consumer and data protection laws always prevail;
// countries with their own text (Brazil, Portugal, Spain) are in br.ts, pt.ts and es.ts.
import { mailLink, paymentNames, telLink } from './shared';
import type { LegalBlock, LegalContext, LegalDoc, LegalPack } from './types';

/** Date of the last update of these texts. Change it whenever the content changes. */
export const UPDATED = '2026-10-05';

const CONTACT_PAGE = '[contact page](/contatos)';

/** "by email at x@y" or, without a store email (the contact page does not show one either), the contact form. */
const via = (c: LegalContext) => (c.email ? `by email at ${mailLink(c.email)}` : `using the form on our ${CONTACT_PAGE}`);

const identity = (c: LegalContext) => ({
  kind: 'facts' as const,
  items: [
    { label: 'Store', value: c.store },
    c.taxId && { label: 'Tax ID', value: c.taxId },
    c.email && { label: 'Email', value: mailLink(c.email) },
    c.phone && { label: 'Phone', value: telLink(c.phone) },
  ],
});

/** Cookies: tools turned on in Admin > Privacy and cookies, or the sentence that there are none. */
const cookieTools = (c: LegalContext): LegalBlock[] =>
  c.tools.length
    ? [
        { kind: 'p', text: 'With your consent, the website uses these third-party tools:' },
        {
          kind: 'entities',
          items: c.tools.map((t) => ({
            name: t.name,
            place: t.provider,
            text: t.category === 'analytics'
              ? 'Statistics: counts visits and page views in aggregate. Only loaded if you accept Statistics.'
              : 'Marketing: measures ad results and allows relevant campaigns to be shown. Only loaded if you accept Marketing.',
          })),
        },
        { kind: 'p', text: 'These companies may process data outside your country, with the contractual safeguards they offer. If you withdraw consent, their cookies are deleted.' },
      ]
    : [{ kind: 'p', text: 'At the moment, the website does not use any statistics or marketing tools. If that changes, they will only be switched on with your consent and listed in this section.' }];

const consentRecord = (c: LegalContext): LegalBlock => ({
  kind: 'p',
  text: `Your choice is valid for ${c.consentMonths} months; after that we ask again. To be able to prove consent, we keep a record of the choice (ID, categories, date and notice version), without your IP address. The ID is shown in the cookie preferences.`,
});

function privacy(c: LegalContext): LegalDoc {
  const pays = paymentNames(c.country);
  return {
    intro: [
      `This policy explains how **${c.store}** handles your personal data when you visit the website, create an account, place an order or contact us.`,
      'In short: we use your data to sell, make and deliver your pieces, comply with the law and keep the website secure. We do not sell personal data.',
    ],
    sections: [
      {
        id: 'who',
        title: 'Who we are',
        blocks: [
          { kind: 'p', text: 'The business responsible for your personal data is:' },
          identity(c),
          !c.email && { kind: 'p', text: `To reach us, use the form on our ${CONTACT_PAGE}.` },
        ],
      },
      {
        id: 'data',
        title: 'Data we collect',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Account:** name, email, phone, tax ID when required, password (stored encrypted by the authentication service) and communication preferences.',
              '**Orders and delivery:** shipping and billing address, products, amounts, order history and status. If you check out as a guest, we handle the same order data.',
              '**Custom pieces:** texts, names, sizes, colours, images and files you send to customise a piece.',
              '**Payment:** payment method, transaction status and references and, when the method requires it, the receipt you upload. Card details are entered on the payment provider’s page and never pass through our website.',
              '**Support:** messages you send through the contact form, by email or other channels.',
              '**Reviews:** the rating and comment you publish about a product.',
              '**Newsletter:** your email, if you subscribe.',
              '**Technical and security data:** IP address, date and time of access, browser, sign-in attempts and the cookie information described in the Cookies section.',
            ],
          },
          { kind: 'p', text: 'Files you analyse in the 3D quote tool are read only in your browser and are not sent to us.' },
        ],
      },
      {
        id: 'use',
        title: 'How we use your data',
        blocks: [
          {
            kind: 'list',
            items: [
              '**To provide our service:** manage your account, process and make your order, deliver it and support you.',
              '**To comply with the law:** invoicing, tax and accounting records.',
              '**To protect you and us:** prevent fraud, secure accounts and handle complaints or legal claims.',
              '**With your consent:** newsletter and optional cookies. You can withdraw consent at any time.',
            ],
          },
          c.eu && { kind: 'p', text: 'If you are in the European Economic Area, these uses are based on Article 6(1) of the GDPR: contract (b), legal obligation (c), legitimate interests (f) and consent (a).' },
        ],
      },
      {
        id: 'sharing',
        title: 'Who we share it with',
        blocks: [
          { kind: 'p', text: 'We do not sell your personal data. We share only what is needed with service providers that help us run the store:' },
          {
            kind: 'entities',
            items: [
              { name: 'Website hosting', text: 'A server contracted by the store that holds the website, database, sign-in and files, including customisation files. We run the open-source Supabase software on that server.' },
              { name: pays.length ? pays.join(', ') : 'Payment provider', text: 'Processes payments made with the methods offered at checkout and runs fraud checks.' },
              { name: 'Carriers', text: 'Receive your name, address and phone number to deliver your order.' },
              { name: 'Transactional email service', text: 'Sends account and order emails.' },
              { name: 'WhatsApp (Meta)', text: 'Only if you choose to contact us there. WhatsApp’s own terms then also apply.' },
            ],
          },
          { kind: 'p', text: 'We may also disclose data to public authorities when the law requires it.' },
        ],
      },
      {
        id: 'transfers',
        title: 'International transfers',
        blocks: [
          { kind: 'p', text: 'Some providers may process data in countries other than the one where you live. When that happens, we rely on safeguards recognised by the applicable law, such as standard contractual clauses, or on the transfer being necessary to perform our contract with you.' },
        ],
      },
      {
        id: 'retention',
        title: 'How long we keep it',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Account:** while it is active. You can delete it at any time.',
              '**Orders and invoices:** for the period required by tax and accounting law.',
              '**Customisation files:** as long as needed to make the order and handle any complaint.',
              '**Newsletter and optional cookies:** until you withdraw consent.',
            ],
          },
          { kind: 'p', text: 'After that, data is deleted or anonymised.' },
        ],
      },
      {
        id: 'rights',
        title: 'Your rights',
        blocks: [
          { kind: 'p', text: 'Depending on where you live, you may have the right to access, correct, delete or receive a copy of your data, to object to or restrict certain uses, and to withdraw consent.' },
          { kind: 'p', text: 'In your account, under [Privacy](/dashboard?tab=privacidade), you can download your data and delete your account. Deleting it removes your profile, addresses, favourites, cart and reviews; past orders are anonymised and kept only as long as tax law requires.' },
          { kind: 'p', text: `For any other request, contact us ${via(c)}. We may ask you to confirm your identity to protect your data.` },
          { kind: 'p', text: c.eu ? 'You can also lodge a complaint with the data protection authority of the country where you live.' : 'You can also contact the data protection or consumer authority of the country where you live.' },
        ],
      },
      {
        id: 'security',
        title: 'Security',
        blocks: [
          { kind: 'p', text: 'We use encrypted connections (HTTPS), role-based access control, encrypted passwords and sign-in attempt limits. If a security incident puts your rights at risk, we will notify you and the competent authorities as required by law.' },
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies',
        blocks: [
          { kind: 'p', text: 'Cookies and similar technologies, such as the browser’s local storage, keep small pieces of information on your device. They fall into four categories:' },
          {
            kind: 'list',
            items: [
              '**Necessary:** session, sign-in, cart, chosen country and language, security and your cookie choice. Always on, because the website does not work without them.',
              '**Preferences:** remember choices to personalise your experience.',
              '**Statistics:** help us understand, in aggregate, how the website is used.',
              '**Marketing:** let us show relevant messages and campaigns.',
            ],
          },
          ...cookieTools(c),
          { kind: 'p', text: 'Optional cookies are only used with your consent, and you can change your choice at any time:' },
          consentRecord(c),
          { kind: 'cookieSettings' },
        ],
      },
      {
        id: 'children',
        title: 'Children',
        blocks: [
          { kind: 'p', text: 'The website is not directed to children under 13, and purchases must be made by adults or with the permission of a parent or guardian. If you believe a child has given us personal data, contact us and we will delete it.' },
        ],
      },
      {
        id: 'changes',
        title: 'Changes to this policy',
        blocks: [
          { kind: 'p', text: 'We may update this policy. The date of the last update is shown at the top of the page, and we will announce significant changes on the website or by email.' },
        ],
      },
    ],
  };
}

function terms(c: LegalContext): LegalDoc {
  return {
    intro: [
      `These terms apply to purchases made on the **${c.store}** website. Nothing in them limits the rights you have under the consumer protection laws of the country where you live.`,
      'By placing an order, you confirm that you have read and accept these terms and our [Privacy policy](/politica-privacidade).',
    ],
    sections: [
      {
        id: 'seller',
        title: 'Who we are',
        blocks: [identity(c), { kind: 'p', text: `Customer support: ${via(c)}.` }],
      },
      {
        id: 'products',
        title: 'Products and 3D printing',
        blocks: [
          { kind: 'p', text: 'Our pieces are made to order with 3D printing. Some features are part of the process and are not defects: fine layer lines, slight colour differences between material batches and small size variations within the process tolerance.' },
          { kind: 'p', text: 'Photos and 3D previews aim to show each piece faithfully. Size, material, available colours and production time are shown on each product page.' },
          { kind: 'p', text: 'Unless the product page says otherwise, our pieces are not toys and are not intended for young children, food contact or high heat.' },
        ],
      },
      {
        id: 'orders',
        title: 'Orders',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              'You choose the products and enter your delivery details.',
              'Before paying, you see a summary with products, shipping, discounts and the total.',
              'After you confirm, you receive an order confirmation by email and can follow the order in your account.',
              'Production starts once payment is confirmed.',
            ],
          },
          { kind: 'p', text: 'If there is an obvious pricing error, a suspicion of fraud or we cannot make the piece, we may cancel the order. We will let you know and refund everything you paid.' },
        ],
      },
      {
        id: 'prices',
        title: 'Prices, taxes and payment',
        blocks: [
          {
            kind: 'list',
            items: [
              c.country.taxMode === 'vat'
                ? 'Prices include VAT at the applicable rate.'
                : 'The price shown at checkout is the final price for the products and shipping.',
              'Depending on your country, customs duties or import taxes may apply. When we can calculate them, they are shown at checkout; otherwise they may be collected by the carrier on delivery.',
              'The available payment methods are shown at checkout. Payments may be checked by the payment provider.',
              'Discount codes follow the rules of each campaign and are validated at checkout.',
            ],
          },
        ],
      },
      {
        id: 'delivery',
        title: 'Delivery',
        blocks: [
          {
            kind: 'list',
            items: [
              'The total time is the production time shown on the product plus the carrier time shown at checkout, in business days after payment is confirmed.',
              'Please check your address before confirming: if an address error causes a return, resending may have a cost.',
              'You can follow your order in your account and on the [order tracking](/rastrear) page.',
            ],
          },
        ],
      },
      {
        id: 'returns',
        title: 'Returns and cancellations',
        blocks: [
          { kind: 'p', text: 'You can return items within **14 days** of delivery, or within a longer period if the law of your country requires it. See [Returns and refunds](/devolucoes) for the steps.' },
        ],
      },
      {
        id: 'personalizados',
        title: 'Custom pieces',
        blocks: [
          { kind: 'p', text: 'Custom pieces are made just for you from the information you send: texts, names, sizes, colours or files.' },
          {
            kind: 'list',
            items: [
              'Before confirming, check the preview, spelling, sizes and colours carefully. Differences caused by information you sent are not defects.',
              'You can cancel free of charge until production starts.',
              'Once production has started, custom pieces cannot be returned for a change of mind, unless the law of your country gives you that right.',
              'You confirm that you have the right to use the texts, images, trademarks and files you send. We may refuse illegal, offensive or infringing content.',
            ],
          },
          { kind: 'note', text: 'This does not affect your rights for faulty items or any other right you have under the law of your country.' },
        ],
      },
      {
        id: 'faulty',
        title: 'Faulty items',
        blocks: [
          { kind: 'p', text: `If an item arrives faulty, damaged or different from what you ordered, contact us ${via(c)} with photos. We will repair, replace or refund it, in line with the law of your country, and cover the return costs.` },
          { kind: 'p', text: 'Normal wear, misuse (such as high heat, impact or chemicals) and the features of 3D printing described above are not defects.' },
        ],
      },
      {
        id: 'account',
        title: 'Your account',
        blocks: [
          { kind: 'p', text: 'You are responsible for providing accurate information and keeping your password safe. Let us know if you notice any unauthorised use of your account.' },
        ],
      },
      {
        id: 'ip',
        title: 'Intellectual property',
        blocks: [
          { kind: 'p', text: `The models, photos, texts and the ${c.store} brand belong to the store or its licensors. Buying a piece does not give you the right to copy, reproduce or sell the 3D models.` },
        ],
      },
      {
        id: 'privacy',
        title: 'Personal data',
        blocks: [{ kind: 'p', text: 'How we handle your personal data is described in our [Privacy policy](/politica-privacidade).' }],
      },
      {
        id: 'law',
        title: 'Governing law and disputes',
        blocks: [
          { kind: 'p', text: `If you have a problem, please contact us first ${via(c)}. These terms do not deprive you of the protection of the mandatory consumer laws of the country where you live, and you may bring a claim before the courts or consumer bodies available to you there.` },
        ],
      },
      {
        id: 'changes',
        title: 'Changes to these terms',
        blocks: [{ kind: 'p', text: 'We may update these terms. Each order is governed by the version in force on the date it was placed.' }],
      },
    ],
  };
}

function returns(c: LegalContext): LegalDoc {
  return {
    intro: ['How to return an item, get a refund and what to do if something arrives faulty.'],
    sections: [
      {
        id: 'period',
        title: '14 days to return',
        blocks: [
          { kind: 'p', text: 'You can return items within **14 days** of delivery without giving a reason. If the law of your country gives you a longer period, that period applies.' },
          { kind: 'p', text: 'For custom pieces, see the [Custom pieces](#custom) section below.' },
        ],
      },
      {
        id: 'how',
        title: 'How to return',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              `Contact us ${via(c)} with your order number and tell us whether you are returning a change of mind item or a faulty one.`,
              'We reply with the return instructions and address.',
              'Pack the item carefully and send it within 14 days of contacting us.',
              'Once we receive the item, or proof that you sent it, we issue the refund.',
            ],
          },
        ],
      },
      {
        id: 'costs',
        title: 'Return costs',
        blocks: [
          { kind: 'p', text: 'Unless the law of your country says otherwise, return shipping for a change of mind is paid by you. If the item is faulty, wrong or damaged in transit, we cover all costs.' },
        ],
      },
      {
        id: 'refunds',
        title: 'Refunds',
        blocks: [
          {
            kind: 'list',
            items: [
              'We refund within 14 days of receiving the item or proof of shipment.',
              'We refund the item price and the original standard shipping cost, using the original payment method.',
            ],
          },
        ],
      },
      {
        id: 'faulty',
        title: 'Faulty or wrong items',
        blocks: [
          { kind: 'p', text: `Contact us ${via(c)} with photos of the problem and the packaging. We will repair, replace or refund the item in line with the law of your country.` },
        ],
      },
      {
        id: 'custom',
        title: 'Custom pieces',
        blocks: [
          { kind: 'p', text: 'You can cancel a custom piece free of charge until production starts. After that, custom pieces cannot be returned for a change of mind, unless the law of your country gives you that right.' },
          { kind: 'note', text: 'Custom pieces are covered for faults just like any other item.' },
        ],
      },
    ],
  };
}

export const INTL_PACK: LegalPack = { lang: 'en', updated: UPDATED, docs: { privacy, terms, returns } };
