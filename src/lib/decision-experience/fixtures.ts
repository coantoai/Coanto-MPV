import { copy as c, type DecisionEvent } from "./model";
// All entities, observations, prices and relative times below are fictional fixtures.
// No real-company evidence, market measurement or provider result is implied.
export const events: DecisionEvent[] = [
  {
    id: "price-window",
    cohort: "retailer",
    posture: "WATCH",
    theme: c("حماية الربح", "Protect your margin"),
    title: c(
      "المنافس خفّض السعر. مش لازم تلحقه بعد.",
      "They dropped the price. You don’t need to follow. Yet.",
    ),
    changedTitle: c(
      "المخزون رجع، ومنافس ثانٍ لحق العرض. راجع موقفك اليوم.",
      "Stock is back. Another seller followed. Revisit your offer today.",
    ),
    happened: c(
      "متجر «مدار» خفّض ماكينة القهوة Brew One من 200$ إلى 180$، لكن نفس الموديل غير متوفر عنده.",
      "Madar reduced the Brew One coffee machine from $200 to $180, but that exact model is out of stock.",
    ),
    relevance: c(
      "تبيع نفس الموديل بـ200$. السعر الأقل قد يلفت زبائنك، لكن عرضًا لا يمكن طلبه ليس مثل عرض متاح للتسليم.",
      "You sell the same model for $200. A lower price may draw attention, but an unavailable offer is not the same as a deliverable one.",
    ),
    reasons: [
      c(
        "نفس الموديل، لكن غير متوفر عند المنافس.",
        "Same model, but unavailable at the rival.",
      ),
      c("المتجر الآخر ما غيّر سعره.", "The other seller has not moved."),
      c(
        "العرض السابق انتهى بسرعة؛ هذا لا يثبت أن الحالي سينتهي مثله.",
        "The previous offer ended quickly; that does not prove this one will.",
      ),
    ],
    against: c(
      "الزبون قد ينتظر عودة المخزون بدل الشراء منك. والسعر قد يبقى منخفضًا؛ تاريخ عرض واحد لا يكفي لاعتباره نمطًا.",
      "Customers may wait for a restock instead of buying from you. The lower price may persist; one previous offer is not a reliable pattern.",
    ),
    unknowns: [
      c("متى يرجع المخزون؟", "When will the rival restock?"),
      c(
        "هل زبائنك يؤجلون الشراء فعلًا؟",
        "Are your customers actually delaying purchases?",
      ),
      c("ما أقل سعر مقبول لك؟", "What is your minimum acceptable price?"),
    ],
    trigger: c(
      "إذا رجع نفس الموديل للمخزون وبقي السعر 180$، أو لحقه منافس آخر، نعيد النظر.",
      "Reopen if the same model returns at $180, or another seller follows.",
    ),
    next: c(
      "ثبّت سعرك مؤقتًا. تحقّق من التوفر والسعر في المراجعة التالية.",
      "Hold your price for now. Check availability and price at the next review.",
    ),
    review: c(
      "غدًا، أو فور تحقق أحد الشرطين. في المعاينة: جرّب التحديث بنفسك.",
      "Tomorrow, or as soon as either trigger occurs. In this preview: simulate the update.",
    ),
    entity: c(
      "«مدار» منافس مباشر لهذا الموديل. سبب التخفيض غير معروف؛ لا نعرف إن كان تصفية أو عرضًا مؤقتًا.",
      "Madar is a direct competitor for this model. Its intent is unknown: clearance and a temporary promotion are both possible.",
    ),
    alternatives: [
      c("عرض قصير لجذب الزيارات.", "A short promotion to attract visits."),
      c("تصفية قبل إعادة التخزين.", "Clearance before a restock."),
      c("سعر جديد قد يستمر.", "A new price that may persist."),
    ],
    question: c(
      "ما أقل سعر تقدر تبيعه بدون كسر حدّ الربح المقبول؟",
      "What is the lowest price you can accept without breaking your margin guardrail?",
    ),
    observations: [
      {
        id: "A1",
        title: c("سعر وتوفر نفس الموديل", "Exact-model offer"),
        detail: c(
          "Brew One · نفس رقم الموديل · 200$ ← 180$ · غير متوفر. لقطة تجريبية وليست موقعًا حيًا.",
          "Brew One · same model identifier · $200 → $180 · out of stock. Fictional snapshot, not a live website.",
        ),
        time: "Day 0 · 09:10",
        group: "Madar · demo snapshot",
        kind: "observation",
        stance: "for",
      },
      {
        id: "A2",
        title: c("باقي السوق لم يلحق", "No second mover yet"),
        detail: c(
          "«نواة» يعرض نفس الموديل بـ200$ ومتوفر. هذا يغطي متجرًا آخر فقط، وليس السوق كله.",
          "Nawa lists the same model at $200, in stock. This covers one other seller, not the entire market.",
        ),
        time: "Day 0 · 09:12",
        group: "Nawa · demo snapshot",
        kind: "observation",
        stance: "for",
      },
      {
        id: "A3",
        title: c(
          "عرض سابق، وليس نمطًا مثبتًا",
          "One past offer, not a proven pattern",
        ),
        detail: c(
          "لقطتان تجريبيتان: انخفض السعر قبل أسبوع ثم عاد بعد يومين. لا نعرف سبب الرجوع.",
          "Two fictional snapshots: a cut last week reverted after two days. The reason for the reversal is unknown.",
        ),
        time: "Day -7 / Day -5",
        group: "Madar · same source as A1",
        kind: "observation",
        stance: "for",
      },
      {
        id: "A4",
        title: c(
          "الاهتمام قد يستمر رغم نفاد المخزون",
          "Interest can survive a stockout",
        ),
        detail: c(
          "صفحة العرض التجريبية ما زالت تعرض السعر وتسمح بطلب إشعار عودة المخزون. لا تثبت وجود طلب فعلي.",
          "The fictional offer page still shows the price and a restock-notification option. This does not prove actual demand.",
        ),
        time: "Day 0 · 09:10",
        group: "Madar · same source as A1",
        kind: "observation",
        stance: "against",
      },
    ],
    history: [
      {
        time: "Day -7",
        title: c("عرض سابق", "Previous promotion"),
        detail: c(
          "ظهر سعر أقل؛ لا بيانات مبيعات.",
          "Lower price observed; no sales data.",
        ),
      },
      {
        time: "Day -5",
        title: c("رجوع السعر", "Price reverted"),
        detail: c(
          "سجل واحد لا يكفي لتوقع المستقبل.",
          "One episode cannot predict the future.",
        ),
      },
      {
        time: "Day 0",
        title: c("تخفيض جديد مع نفاد المخزون", "New cut, no stock"),
        detail: c(
          "WATCH: التوفر يغيّر معنى السعر.",
          "WATCH: availability changes the meaning of price.",
        ),
      },
    ],
  },
  {
    id: "bundle-test",
    cohort: "retailer",
    posture: "TEST",
    theme: c("فرصة للنمو", "A small growth opportunity"),
    title: c(
      "اختبر باقة للمبتدئين قبل ما توسّع الكتالوج.",
      "Test a starter bundle before expanding the catalog.",
    ),
    happened: c(
      "ظهرت طلبات لشرح الملحقات في مراجعات تجريبية، ومنافس يعرض باقة ماكينة مع ملحقات.",
      "Illustrative reviews ask about accessories, and a rival offers a machine-and-accessories bundle.",
    ),
    relevance: c(
      "عندك الملحقات أصلًا. ممكن تختبر طريقة عرضها مع الماكينة بدون طلب مخزون جديد.",
      "You already carry the accessories. You could test presenting them together without ordering new stock.",
    ),
    reasons: [
      c(
        "التجربة تستخدم منتجاتك الحالية.",
        "The test uses your existing products.",
      ),
      c(
        "السؤال يتعلّق بسهولة الاختيار، مش السعر فقط.",
        "The question is ease of choosing, not just price.",
      ),
      c("اختبار محدود يمكن إيقافه.", "A bounded test can be stopped."),
    ],
    against: c(
      "المراجعات عينة صغيرة منتقاة، وقد تعكس مشكلة شرح فقط. وجود باقة عند المنافس لا يثبت أنها تُباع.",
      "The reviews are a small selected sample and may only indicate unclear guidance. A rival’s bundle does not prove sales.",
    ),
    unknowns: [
      c(
        "هل المشترون يريدون الباقة أم شرحًا أوضح؟",
        "Do buyers want a bundle or clearer guidance?",
      ),
      c("هل هامش الباقة مقبول؟", "Is the bundle margin acceptable?"),
    ],
    trigger: c(
      "نوسّع التجربة فقط إذا أظهرت بياناتك طلبًا مع هامش مقبول؛ نوقفها إذا زادت تكلفة الطلب أو المرتجعات.",
      "Expand only if your data shows demand at an acceptable margin; stop if order costs or returns increase.",
    ),
    next: c(
      "جهّز صفحة باقة واحدة للمراجعة. حدّد سقف التكلفة ومعيار النجاح قبل عرضها على العملاء.",
      "Prepare one bundle page for review. Set a cost cap and success criterion before showing it to customers.",
    ),
    review: c(
      "بعد أسبوع من اختبار معتمد، لا من تاريخ فتح الديمو.",
      "One week after an approved test starts, not after opening this demo.",
    ),
    entity: c(
      "المنافس يعرض حلًا لنفس استخدام الماكينة؛ الملحقات ليست متطابقة.",
      "The rival addresses the same machine use case; accessories are not identical.",
    ),
    alternatives: [
      c("حاجة فعلية لباقة.", "A genuine bundle need."),
      c("نقص في شرح الملحقات.", "Insufficient accessory guidance."),
    ],
    question: c(
      "هل تقدر تجمع الملحقات الحالية بهامش مقبول وبدون مخزون جديد؟",
      "Can you bundle existing accessories at an acceptable margin without new stock?",
    ),
    observations: [
      {
        id: "B1",
        title: c("أسئلة من مراجعات تجريبية", "Illustrative review questions"),
        detail: c(
          "عينة مختارة تسأل: أي ملحق أحتاج؟ لا نعاملها كقياس لحجم الطلب.",
          "Selected examples ask which accessory is needed. They do not measure demand prevalence.",
        ),
        time: "Day -2",
        group: "Review sample · demo",
        kind: "observation",
        stance: "for",
      },
      {
        id: "B2",
        title: c("باقة عند المنافس", "Rival bundle"),
        detail: c(
          "باقة ظاهرة في كتالوج تجريبي، بلا بيانات مبيعات.",
          "A bundle listed in a fictional catalog, without sales data.",
        ),
        time: "Day 0",
        group: "Nawa · demo catalog",
        kind: "observation",
        stance: "against",
      },
    ],
    history: [
      {
        time: "Day -2",
        title: c("سؤال عن الملحقات", "Accessory question"),
        detail: c(
          "دليل محدود يحتاج اختبارًا.",
          "Limited evidence needs a test.",
        ),
      },
      {
        time: "Day 0",
        title: c("TEST", "TEST"),
        detail: c(
          "اختبار العرض قبل شراء مخزون.",
          "Test the offer before buying stock.",
        ),
      },
    ],
  },
  {
    id: "wrong-match",
    cohort: "retailer",
    posture: "IGNORE",
    theme: c("ضجيج تم استبعاده", "Intentionally filtered"),
    title: c(
      "السعر الأرخص لنسخة مختلفة. لا تغيّر عرضك بسببه.",
      "The cheaper price is a different version. Leave your offer alone.",
    ),
    happened: c(
      "التنبيه يقارن Brew One بنسخة Mini الأصغر.",
      "The alert compares Brew One with the smaller Mini version.",
    ),
    relevance: c(
      "اختلاف السعة والملحقات يجعل مقارنة السعر المباشر مضلّلة.",
      "Capacity and accessory differences make a direct price comparison misleading.",
    ),
    reasons: [
      c("رقم الموديل مختلف.", "The model identifier differs."),
      c("المواصفات ليست متطابقة.", "Specifications do not match."),
    ],
    against: c(
      "قد يختار بعض الزبائن النسخة الأصغر؛ اختلاف الموديل لا ينفي المنافسة بالكامل.",
      "Some buyers may choose the smaller version; a model mismatch does not eliminate substitution.",
    ),
    unknowns: [
      c(
        "هل زبائنك يعتبرون النسختين بديلين؟",
        "Do your customers consider them substitutes?",
      ),
    ],
    trigger: c(
      "نعيد النظر إذا ظهر دليل من زبائنك على المقارنة بين النسختين.",
      "Reopen if customer evidence shows meaningful substitution.",
    ),
    next: c(
      "استبعد المقارنة السعرية المباشرة. لا تستبعد المنتج من متابعة البدائل.",
      "Exclude this direct price match, not the product from substitute monitoring.",
    ),
    review: c(
      "عند ظهور دليل على قابلية الاستبدال.",
      "When substitution evidence emerges.",
    ),
    entity: c(
      "منتجان مختلفان في نفس الفئة.",
      "Two different products in the same category.",
    ),
    alternatives: [
      c("خطأ مطابقة.", "A matching error."),
      c("بديل اقتصادي لبعض الزبائن.", "A budget substitute for some buyers."),
    ],
    question: c(
      "هل سمعت زبونًا يقارن هاتين النسختين؟",
      "Have customers compared these versions?",
    ),
    observations: [
      {
        id: "I1",
        title: c("اختلاف الموديل", "Model mismatch"),
        detail: c(
          "Brew One ≠ Brew Mini، حسب مواصفات السيناريو.",
          "Brew One ≠ Brew Mini in the scenario specifications.",
        ),
        time: "Day 0",
        group: "Demo product catalog",
        kind: "observation",
        stance: "for",
      },
      {
        id: "I2",
        title: c("استخدام قريب", "Similar use case"),
        detail: c(
          "النسختان لتحضير القهوة المنزلية؛ هذا لا يثبت تطابق الطلب.",
          "Both make home coffee; this does not establish identical demand.",
        ),
        time: "Day 0",
        group: "Demo product catalog",
        kind: "observation",
        stance: "against",
      },
    ],
    history: [],
  },
  {
    id: "channel-review",
    cohort: "brand",
    posture: "ACT",
    theme: c("وضوح قنوات البيع", "Channel clarity"),
    title: c(
      "العرض لا يوضح الضمان. تحقّق قبل ما تتواصل مع البائع.",
      "The offer leaves warranty unclear. Verify before contacting the seller.",
    ),
    happened: c(
      "بائع يعرض منتج «رِواق» مع عبارة ضمان لا تطابق صفحة العلامة في السيناريو.",
      "A seller lists a Riwaq product with warranty wording that differs from the brand page in this scenario.",
    ),
    relevance: c(
      "أنت مسؤول القناة. اختلاف الضمان قد يربك الزبون، لكن لا يثبت مخالفة أو أن البائع غير معتمد.",
      "You own the channel relationship. Conflicting warranty wording may confuse customers, but does not establish a violation or an unauthorized seller.",
    ),
    reasons: [
      c("نفس رقم المنتج.", "The product identifier matches."),
      c("عبارتا الضمان مختلفتان.", "The warranty statements differ."),
      c(
        "الخطوة الآن تحقق داخلي قابل للتراجع.",
        "The immediate step is a reversible internal check.",
      ),
    ],
    against: c(
      "قد يكون ضمانًا إضافيًا من البائع أو نسخة إقليمية. لا نعرف العقد ولا هوية الحساب بشكل مؤكد.",
      "It may be an additional seller warranty or a regional version. The contract and account identity are not confirmed.",
    ),
    unknowns: [
      c(
        "هل البائع معتمد لهذا السوق؟",
        "Is this seller authorized for this market?",
      ),
      c(
        "هل الضمان إضافي أم بديل؟",
        "Is this warranty additional or a replacement?",
      ),
    ],
    trigger: c(
      "إذا أكدت سجلاتك هوية البائع وشروط الضمان، راجع هل التواصل ضروري.",
      "Once your records confirm identity and warranty terms, review whether outreach is needed.",
    ),
    next: c(
      "اطلب من مسؤول القناة مراجعة سجل البائع وشروط الضمان اليوم. لا ترسل اتهامًا أو طلب تغيير سعر.",
      "Ask the channel owner to check the seller record and warranty terms today. Do not send an accusation or a price-enforcement request.",
    ),
    review: c("بعد مراجعة السجل الداخلي.", "After the internal record check."),
    entity: c(
      "هوية البائع وعلاقته بالعلامة لم تُحسما. COANTO لا يصدر حكمًا قانونيًا.",
      "Seller identity and brand relationship are unresolved. COANTO does not make a legal determination.",
    ),
    alternatives: [
      c("ضمان إضافي من البائع.", "An additional seller warranty."),
      c("نسخة لسوق مختلف.", "A different regional version."),
      c("وصف قديم يحتاج تصحيحًا.", "An outdated description."),
    ],
    question: c(
      "هل هذا الحساب موجود في قائمة بائعيك المعتمدين؟",
      "Is this account in your authorized-seller records?",
    ),
    observations: [
      {
        id: "C1",
        title: c("وصف العلامة", "Brand wording"),
        detail: c(
          "الضمان في صفحة العلامة التجريبية يذكر خدمة العلامة.",
          "The fictional brand page specifies brand servicing.",
        ),
        time: "Day 0 · 10:00",
        group: "Riwaq · demo page",
        kind: "observation",
        stance: "for",
      },
      {
        id: "C2",
        title: c("وصف البائع", "Seller wording"),
        detail: c(
          "صفحة البائع التجريبية تذكر خدمة عبر البائع. قد تكون خدمة إضافية.",
          "The fictional seller page specifies seller servicing. This may be additional coverage.",
        ),
        time: "Day 0 · 10:03",
        group: "Seller · demo page",
        kind: "observation",
        stance: "against",
      },
    ],
    history: [
      {
        time: "Day 0",
        title: c(
          "اختلاف موثّق في السيناريو",
          "Difference recorded in scenario",
        ),
        detail: c(
          "السبب غير محسوم؛ تحقق داخلي أولًا.",
          "Cause unresolved; internal verification first.",
        ),
      },
    ],
  },
  {
    id: "missing-evidence",
    cohort: "brand",
    posture: "INSUFFICIENT",
    theme: c("نحتاج دليلًا أوضح", "A missing piece"),
    title: c(
      "ما نقدر نحكم على هذا العرض بعد.",
      "We cannot judge this offer yet.",
    ),
    happened: c(
      "لقطة تعرض سعرًا أقل، لكن اسم البائع ورقم الموديل غير واضحين.",
      "A screenshot shows a lower price, but seller identity and model are unclear.",
    ),
    relevance: c(
      "بدون هوية المنتج والبائع، أي استجابة قد تستهدف عرضًا مختلفًا.",
      "Without product and seller identity, a response could target the wrong offer.",
    ),
    reasons: [
      c("رقم الموديل غير واضح.", "Model identity is unclear."),
      c(
        "وقت التقاط الصورة غير معروف.",
        "The screenshot capture time is unknown.",
      ),
    ],
    against: c(
      "قد يكون العرض حقيقيًا وحديثًا. نقص الدليل لا يعني أن العرض غير موجود.",
      "The offer may be real and current. Missing evidence does not mean the offer does not exist.",
    ),
    unknowns: [
      c("الموديل، البائع، التاريخ، والسوق.", "Model, seller, date and market."),
    ],
    trigger: c(
      "رابط العرض مع موديل واضح وتاريخ قابل للتحقق.",
      "An offer URL with clear model identity and a verifiable timestamp.",
    ),
    next: c(
      "أضف رابط العرض أو لقطة كاملة مع تاريخها قبل اتخاذ قرار.",
      "Obtain the offer URL or a complete dated capture before deciding.",
    ),
    review: c("عند وصول الدليل الناقص.", "When the missing evidence arrives."),
    entity: c(
      "البائع غير محدد؛ لا تصنيف للمنافسة بعد.",
      "Seller unidentified; competitive relevance unestablished.",
    ),
    alternatives: [
      c("عرض قديم أو منتج آخر.", "An old offer or another product."),
      c("عرض حقيقي يحتاج تثبيتًا.", "A real offer awaiting verification."),
    ],
    question: c(
      "هل عندك رابط الصفحة الأصلية؟",
      "Do you have the original page URL?",
    ),
    observations: [
      {
        id: "U1",
        title: c("لقطة ناقصة", "Incomplete capture"),
        detail: c(
          "صورة تجريبية غير مؤرخة لا تثبت هوية الموديل أو البائع.",
          "An undated illustrative capture does not establish model or seller identity.",
        ),
        time: "Unknown",
        group: "Unverified demo capture",
        kind: "observation",
        stance: "against",
      },
    ],
    history: [],
  },
];
