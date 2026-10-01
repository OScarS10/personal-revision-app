import type { ChapterKnowledge } from "@/lib/types";

/*
  Authored teaching content, keyed by chapter id.

  This exists because the app was diagnosing without teaching. It could tell a
  learner that 4.1.4 was weak and then offer a question about which part of the
  specification a bullet came from, which is a way of measuring familiarity with
  a document rather than with economics.

  The vocabulary is chosen for what the mark scheme actually rewards. Where a
  term has a specific misapplication that costs marks, that is recorded, because
  knowing the definition and avoiding the trap are different things and the
  second is what loses marks.

  Coverage is incomplete on purpose. A chapter absent from this file produces no
  questions and is listed as a gap, which is honest; a chapter padded with
  generated filler would not be.
*/

export const KNOWLEDGE: Record<string, ChapterKnowledge> = {
  // ------------------------------------------------ AQA Economics 4.1.8
  "econ-4.1.8": {
    summary:
      "Why a wage is what it is. Labour is a factor of production with its own supply and demand, a wage is the price that clears that market, and the same diagram explains why a minimum wage can put people out of work.",
    keyIdeas: [
      "The demand for labour is a derived demand: it comes from the marginal revenue product of labour, so it falls with the wage.",
      "The real wage, not the nominal wage, is what determines labour supply and demand, because workers respond to what they can buy.",
      "A binding minimum wage raises the price of labour above equilibrium, so firms move up a downward-sloping demand curve and employ fewer workers.",
    ],
    commonMistakes: [
      "Saying a minimum wage raises employment because more people want to work. Supply rising creates unemployment; employment is set by demand.",
      "Confusing nominal and real wage changes. A 10% nominal rise with 8% inflation is roughly a 2% real rise, not 10%.",
      "Claiming elasticity follows from the direction a price moved. Elasticity is the size of the quantity response, so a rise says nothing about it.",
    ],
    examTip:
      "For evaluation on the minimum wage, expect the mechanism (labour demand falls, especially where the wage binds hardest), then the distributional counter (those who keep their jobs are usually the lowest paid, so the trade-off may be worth it), then a judgement. Missing the mechanism caps the answer at Level 2.",
    terms: [
      {
        term: "Derived demand",
        definition:
          "Demand for a factor of production that arises from the demand for the good it helps produce, rather than from the factor's own usefulness.",
        commonError:
          "Treating labour demand as if it came from workers wanting to work. Labour is demanded by firms, so its demand curve slopes downwards.",
        example:
          "Demand for nurses falls when NHS funding is cut, even though the need for nursing care has not changed.",
      },
      {
        term: "Marginal revenue product",
        definition:
          "The additional revenue a firm gains from employing one more unit of labour, which is what sets its labour demand.",
        commonError:
          "Using average revenue product instead. A firm hires up to the point where the marginal worker adds more revenue than they cost, not where the average worker does.",
        example:
          "The 30th nurse adds £28 of revenue a day but costs £26 in wages, so the firm hires them.",
      },
      {
        term: "Real wage",
        definition:
          "The wage adjusted for the price level: the quantity of goods and services a nominal wage can buy.",
        commonError:
          "Subtracting the inflation rate from the nominal wage. Real = nominal ÷ (1 + inflation), because inflation is a proportion of the new figure rather than a cash amount.",
        example:
          "£12.00 nominal with 3% inflation is about £11.65 in base-year money, not £9.00.",
      },
      {
        term: "Discrimination",
        definition:
          "Unequal pay or chances of employment between groups for reasons unconnected to productivity.",
        commonError:
          "Assuming discrimination requires open prejudice. Statistical discrimination, taste and occupational segregation all keep a gap open under equal pay law.",
      },
      {
        term: "Occupational segregation",
        definition:
          "The concentration of particular groups into particular jobs, and therefore into particular pay bands.",
        commonError:
          "Describing it as direct discrimination by a single employer. Segregation emerges across firms and over time without any employer acting on purpose.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.1.9
  "econ-4.1.9": {
    summary:
      "How uneven wealth and income are, how we measure it, and what the government can do about it. Inequality is measured by comparing shares of a total, and poverty by comparing income against a threshold.",
    keyIdeas: [
      "Income inequality and wealth inequality are different: income is a flow earned over a period, wealth is a stock held at a point.",
      "The Gini coefficient runs from 0 (perfect equality) to 1 (perfect inequality), and is read from a Lorenz curve's gap from the line of equality.",
      "Absolute poverty is measured against a fixed real threshold, so it can fall while a country gets richer; relative poverty is measured against the current median.",
    ],
    commonMistakes: [
      "Reading a Lorenz curve as though the horizontal axis were income and the vertical axis people. It is the reverse: the area under the curve is income share.",
      "Confusing a rise in nominal income with a rise in real living standards, which ignores whether prices rose faster.",
      "Claiming progressive taxation eliminates inequality. It reduces it, and can be offset by the top earning the same share through capital or tax avoidance.",
    ],
    examTip:
      "A calculated inequality answer should compute the shares first, then interpret. For the Gini, either use the AQA shortcut sum of income shares, or read the coefficient from a supplied Lorenz curve and say which part of the diagram it came from.",
    terms: [
      {
        term: "Lorenz curve",
        definition:
          "A graph showing the cumulative share of income received by the poorest x% of the population, drawn against the line of perfect equality.",
        commonError:
          "Putting the axes the wrong way round, or reading the curve as a demand curve. The gap between the Lorenz curve and the diagonal is the inequality itself.",
      },
      {
        term: "Gini coefficient",
        definition:
          "A single number between 0 and 1 summarising income inequality, where 0 is perfect equality and 1 is perfect inequality.",
        commonError:
          "Treating it as a percentage of income. It is an index, so 0.4 means forty per cent of maximum inequality, not forty per cent of income.",
        example:
          "The UK Gini is roughly 0.36, below the income-weighted average of the OECD.",
      },
      {
        term: "Absolute poverty",
        definition:
          "Poverty measured against a fixed threshold in real terms, set at a level of consumption needed for survival.",
        commonError:
          "Assuming it must rise as an economy grows. It can fall as incomes rise even while relative poverty stays constant.",
      },
      {
        term: "Relative poverty",
        definition:
          "Poverty measured as income below a threshold set relative to the median income of the society being measured.",
        commonError:
          "Quoting it without naming the reference point. A relative measure has no meaning until you say relative to what.",
      },
      {
        term: "Intergenerational mobility",
        definition:
          "The degree to which a person's income or status as an adult depends on their parents' income or status.",
        commonError:
          "Confusing it with social mobility within a lifetime. Intergenerational mobility is about parents and children.",
      },
      {
        term: "Progressive taxation",
        definition:
          "A tax system where the average rate of tax rises with income, so higher earners pay a larger proportion of what they earn.",
        commonError:
          "Assuming it removes inequality rather than reducing it, and ignoring that savings and capital income may be taxed less than earnings.",
      },
    ],
  },
  // ------------------------------------------------ AQA Economics 4.1.7
  "econ-4.1.7": {
    summary:
      "What the government is trying to achieve for the whole economy, how success is measured, and why getting richer is not the same as getting better off. The same growth figure can mean prosperity for some and stagnation for others.",
    keyIdeas: [
      "The macroeconomic aims are growth, employment, price stability and a sustainable external balance, plus equity and environmental sustainability.",
      "Growth is measured on real GDP or GNI per head, which strips out inflation and population change so the comparison is like for like.",
      "Economic development means an improvement in living standards, wellbeing and capabilities, which is a wider and more contested idea than growth.",
      "The aims conflict: faster growth tends to raise inflation, and redistributing income may reduce the incentive to grow.",
    ],
    commonMistakes: [
      "Using nominal GDP to compare living standards over time. Nominal figures rise with prices, so they overstate real growth.",
      "Comparing GDP per head between countries and ignoring that GDP says nothing about distribution, leisure or health.",
      "Presenting the aims as compatible and listing them without explaining a trade-off, which caps evaluation at Level 2.",
    ],
    examTip:
      "On an evaluate question, take one aim on each side of the argument and link it to the mechanism: growth raises AD and therefore inflation; redistribution may reduce incentives; external balance depends on trade and exchange rates. Marks are for the trade-off, not for listing aims.",
    terms: [
      {
        term: "Real GDP per head",
        definition:
          "GDP adjusted for inflation and divided by the population, so it measures output per person in terms of what the goods and services can buy.",
        commonError:
          "Dividing nominal GDP by population, which leaves inflation in the answer and makes a price rise look like a rise in living standards.",
        example:
          "Nominal GDP rises 4% and inflation is 3%, so real GDP per head rose about 1%, before allowing for population growth.",
      },
      {
        term: "Economic development",
        definition:
          "An improvement in a country's standard of living, measured by income per head alongside health, education, income distribution and environmental quality.",
        commonError:
          "Treating it as a synonym for growth. Development is about what people can do with the income, so a country can grow rich without developing if growth goes to a few or costs the environment.",
      },
      {
        term: "External balance",
        definition:
          "Whether the value of exports and imports is sustainable over time, usually measured by the current account deficit as a share of GDP.",
        commonError:
          "Calling any trade deficit a failure. A deficit financed by investment is normal and can be desirable; it becomes a problem when it reflects weak competitiveness.",
      },
      {
        term: "Fiscal sustainability",
        definition:
          "Whether government borrowing is at a level that can be maintained without the public sector finances becoming unstable.",
        commonError:
          "Treating a deficit as automatically unsustainable. Sustainability turns on the size of the deficit, its trend and how fast the economy is growing relative to interest rates.",
      },
      {
        term: "HDI",
        definition:
          "The Human Development Index, a composite of income per head, life expectancy and education, used to compare development rather than growth alone.",
        commonError:
          "Using it as though it measured a country's total output. It measures average human development, so two countries with the same HDI can differ greatly in size.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.2.2
  "econ-4.2.2": {
    summary:
      "What economic growth is, how it is measured, and why actual output moves around the economy's trend. Growth is a rate of change in real output, and the business cycle is the short-run deviation from long-run productive potential.",
    keyIdeas: [
      "Growth is the percentage change in real GDP, so nominal increases must be deflated, and per head figures must also allow for population growth.",
      "The business cycle has four phases: expansion, peak, contraction and trough, driven by changes in aggregate demand.",
      "Short-run growth is limited by spare capacity and can be demand-led; long-run growth depends on the growth of productive potential.",
      "Productive potential rises with increases in the quantity or quality of factors and with better technology.",
    ],
    commonMistakes: [
      "Reporting nominal GDP growth as growth. A 5% nominal increase with 4% inflation is 1% real growth.",
      "Forgetting population growth when the question says growth in GDP per head. Total growth must be less than headline growth if population is growing.",
      "Treating a recovery as a return to the previous peak. In a long-run expansion the trend shifts up, so the cycle turns before output regains its old level.",
    ],
    examTip:
      "Show the real calculation as two separate steps (deflate, then divide by population) rather than one combined formula. Examiners award method marks for the structure even where the arithmetic slips.",
    terms: [
      {
        term: "Real GDP",
        definition:
          "GDP measured in constant prices, so changes reflect changes in the quantity of output rather than in the price level.",
        commonError:
          "Saying 'real GDP is nominal GDP adjusted for population'. Real removes inflation; per head removes population. They are different adjustments and both are needed for a living standards comparison.",
      },
      {
        term: "Business cycle",
        definition:
          "The short-run fluctuation of output around its long-run trend, conventionally divided into expansion, peak, contraction and trough.",
        commonError:
          "Describing the cycle as a smooth series of identical phases, or assuming every expansion ends in a trough below the previous peak. The shape is not fixed.",
      },
      {
        term: "Peak",
        definition:
          "The point in the cycle at which output stops rising and begins to fall.",
        commonError:
          "Calling the peak the highest level of output ever recorded. It is the local maximum within one cycle, and it may be below an earlier peak.",
      },
      {
        term: "Productive potential",
        definition:
          "The maximum output an economy can produce with its existing factors of production and technology, shown by the long-run aggregate supply curve.",
        commonError:
          "Treating spare capacity as part of potential. Potential is about capacity; actual output below it means unemployment of resources, not a smaller economy.",
      },
      {
        term: "Growth in productive potential",
        definition:
          "An increase in the economy's capacity, caused by more or better factors of production or by improved technology.",
        commonError:
          "Confusing it with demand-led growth. Raising AD moves output towards potential; raising potential moves the LRAS curve itself.",
      },
      {
        term: "Growth rate formula",
        definition:
          "Percentage change in real GDP: ((new real GDP − old real GDP) / old real GDP) × 100.",
        commonError:
          "Applying it to nominal GDP, or forgetting to state that the base year's prices were used for both figures.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.2.3
  "econ-4.2.3": {
    summary:
      "The model of the whole economy: what is spent (aggregate demand), what can be produced (aggregate supply), and where the two meet. A single change in spending or in capacity moves output, or the price level, or both.",
    keyIdeas: [
      "Aggregate demand is the total planned expenditure on final goods and services: C + I + G + (X − M).",
      "Aggregate supply shows the relationship between the price level and the quantity of output firms are willing to supply.",
      "In the short run the AS curve slopes upwards, because sticky wages and prices mean higher prices raise real incomes and profits; in the long run it is vertical at potential output.",
      "Equilibrium is where AD = AS. Shifting either curve moves output, the price level, or both, depending on which curve moved and where along the curve.",
    ],
    commonMistakes: [
      "Listing the components of AD but forgetting to subtract imports, or adding them because they are also spending in another country.",
      "Treating investment as a component of consumption, or counting government spending twice through transfers.",
      "Saying a rise in AD always raises output. If the economy is at potential, it raises only the price level.",
      "Describing the long-run AS curve as sloping upwards because of sticky wages. Sticky wages are a short-run assumption.",
    ],
    examTip:
      "Diagrams earn marks: label both axes, name the curve before you shift it, and say which variable moves as you move along the curve. An AD/AS answer with no diagram is capped at Level 2 on a paper-2 evaluate question.",
    terms: [
      {
        term: "Aggregate demand",
        definition:
          "Total planned expenditure on final goods and services produced within an economy: C + I + G + (X − M).",
        commonError:
          "Adding imports. The M term is subtracted because imports are spending that leaves this economy, which is why an import rise reduces AD.",
      },
      {
        term: "Consumption (C)",
        definition:
          "Household spending on final goods and services, determined mainly by disposable income, which depends on real income and real interest rates.",
        commonError:
          "Treating consumption as autonomous. It is the largest and least stable component because it moves with income.",
      },
      {
        term: "Investment (I)",
        definition:
          "Spending on capital goods and additions to inventories, not the purchase of existing assets such as shares.",
        commonError:
          "Using financial asset purchases. Buying shares from another investor does not add to this year's investment; building a factory does.",
      },
      {
        term: "Aggregate supply (SRAS)",
        definition:
          "The short-run aggregate supply curve, showing the quantity of output firms will supply at each price level, sloping upwards because some costs are sticky in nominal terms.",
        commonError:
          "Giving a vertical or downward-sloping short-run curve. The upward slope comes from nominal stickiness, not from rising productivity.",
      },
      {
        term: "Long-run aggregate supply",
        definition:
          "A vertical curve at an economy's productive potential, where output is determined by the economy's factors of production and technology rather than by the price level.",
        commonError:
          "Shifting it when AD changes. A demand change moves along LRAS and changes the price level, not potential output.",
      },
      {
        term: "Equilibrium output",
        definition:
          "The level of real output where aggregate demand equals aggregate supply, which is below potential if the economy has unemployed resources.",
        commonError:
          "Claiming the economy is always at potential. Equilibrium describes a point on AD = AS, not full employment.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.2.4
  "econ-4.2.4": {
    summary:
      "How well an economy is doing on the macro indicators: unemployment by type, inflation measured by index numbers, and the policy levers that shift the labour market. Every indicator has a definition that must be applied exactly.",
    keyIdeas: [
      "Unemployment types have different causes and different cures: cyclical follows the cycle, structural follows a mismatch of skills or location, frictional is time spent between jobs, seasonal is predictable and leaves the headline rate.",
      "Inflation is measured with a weighted index such as the CPI, where weights reflect how much of household spending each good represents.",
      "Deflation is a sustained fall in the general price level, which can be as damaging to an economy as inflation because it raises real debt burdens.",
      "Policies to reduce unemployment include demand management to cut cyclical unemployment and supply-side measures to shift LRAS right.",
    ],
    commonMistakes: [
      "Using the CPI basket without weights, or adding the price relatives instead of taking a weighted average. The mark scheme requires the weighted calculation.",
      "Quoting the unemployment rate as the number of unemployed people rather than a percentage of the labour force.",
      "Treating frictional and structural unemployment as the same thing. Frictional is efficient and temporary; structural requires retraining or mobility.",
      "Calculating an index-number change from the wrong base year, so a rise from one base is presented as a fall from another.",
    ],
    examTip:
      "For the CPI question, write the formula out first: index = (weighted sum of price relatives) / (weighted sum of last year's prices) × 100. Method marks are available even if the arithmetic is wrong.",
    terms: [
      {
        term: "Unemployment rate",
        definition:
          "The number of unemployed people as a percentage of the labour force, where the labour force is all employed plus all unemployed.",
        commonError:
          "Dividing by the working-age population, which is not the denominator the definition requires.",
        example:
          "800,000 unemployed and 32 million employed gives 800,000 / 32,800,000 = 2.4%.",
      },
      {
        term: "Cyclical unemployment",
        definition:
          "Unemployment caused by a fall in aggregate demand during a contraction, so firms employ fewer workers than at full capacity.",
        commonError:
          "Treating it as a problem of the labour market's flexibility. It is a demand deficiency and is treated with expansionary policy.",
      },
      {
        term: "Structural unemployment",
        definition:
          "Unemployment caused by a mismatch between the skills or location of workers and the jobs available.",
        commonError:
          "Describing it as short-term or voluntary. It persists until people retrain, retype or move, which is why supply-side policy is the appropriate response.",
      },
      {
        term: "Frictional unemployment",
        definition:
          "Short-term unemployment arising from the time it takes for workers to move between jobs after a period of job search.",
        commonError:
          "Prescribing policy to eliminate it. Some frictional unemployment is the price of a labour market that allocates workers efficiently.",
      },
      {
        term: "Seasonal unemployment",
        definition:
          "Predictable variation in employment caused by the time of year, such as holiday and agricultural work.",
        commonError:
          "Ignoring that it distorts the headline rate. Because it is predictable, annual figures or the same months each year are needed to see the underlying trend.",
      },
      {
        term: "CPI",
        definition:
          "The Consumer Price Index, a weighted average of price relatives for a basket of about 700 goods and services bought by a typical household.",
        commonError:
          "Treating every item as equally important. A rise in the price of a heavily weighted good moves the index far more than a rise in a marginal one.",
      },
      {
        term: "Weighted price index",
        definition:
          "An index built by giving each good a weight reflecting its share of household spending, so index = (sum of price relatives × weights) / (sum of weights) × 100.",
        commonError:
          "Applying the same weight to every item, or forgetting the divide by the total weight, which produces an index far above 100.",
      },
      {
        term: "Deflation",
        definition:
          "A sustained fall in the general price level, so the CPI falls below its previous level.",
        commonError:
          "Treating it as simply good news. Borrowers repay fixed nominal debts in money that is worth more, and firms delay investment because prices are expected to fall.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.2.5
  "econ-4.2.5": {
    summary:
      "What governments and central banks can do to move the economy, how the two instruments differ in timing and reach, and why automatic stabilisers act without anyone deciding to use them.",
    keyIdeas: [
      "Fiscal policy changes government spending or taxation; monetary policy changes interest rates and the money supply.",
      "Expansionary policy raises AD, raising output and employment but also the price level; contractionary policy does the reverse.",
      "Automatic stabilisers, such as progressive tax and unemployment benefit, respond to the cycle without new legislation or a policy decision.",
      "Fiscal policy is slow and precise but contested in a democratic system; monetary policy is fast and technically independent but cannot act on distribution directly.",
    ],
    commonMistakes: [
      "Describing the multiplier effect as though it always works. It is larger when marginal propensities to consume are high and there is spare capacity.",
      "Claiming fiscal policy works instantly. Legislating and implementing a spending change takes months, so it responds too slowly to a downturn.",
      "Treating automatic stabilisers as discretionary. They need no decision and no new policy; they are a feature of the tax and benefit system.",
      "Confusing the price level with the rate of inflation. Deflationary policy reduces inflation; it does not lower the price level back down.",
    ],
    examTip:
      "Evaluate with the time lag as the spine of the answer: fiscal policy may be correctly targeted but arrives after the cycle has turned, which is why central banks are given operational independence. Add the effect on distribution, which monetary policy cannot address.",
    terms: [
      {
        term: "Fiscal policy",
        definition:
          "The government's use of spending and taxation to influence aggregate demand.",
        commonError:
          "Including monetary policy under the heading, or forgetting that indirect tax changes affect disposable income and therefore consumption.",
      },
      {
        term: "Monetary policy",
        definition:
          "A central bank's use of interest rates and money supply to influence aggregate demand, particularly through borrowing and investment.",
        commonError:
          "Describing the aim as controlling the price level. The aim is usually inflation at a target rate, not a falling price level.",
      },
      {
        term: "Multiplier",
        definition:
          "The factor by which an initial injection of income raises national income, equal to 1 / (1 − MPC) in the simplest model.",
        commonError:
          "Applying it to a level of spending rather than a change. The multiplier amplifies a change, not the stock.",
        example:
          "With an MPC of 0.8, a £1bn rise in government spending raises income by £5bn.",
      },
      {
        term: "Automatic stabilisers",
        definition:
          "Policy that dampens the cycle without a new decision: progressive taxation takes more when incomes rise, and unemployment benefit rises when jobs are lost.",
        commonError:
          "Requiring a budget to take effect, or being described as discretionary.",
      },
      {
        term: "Time lags",
        definition:
          "The delays before a policy change reaches the economy, including recognition, decision, implementation and impact lags.",
        commonError:
          "Assuming a policy change works in the same quarter it is announced. Implementation lag alone usually exceeds a quarter.",
      },
      {
        term: "Supply-side policy",
        definition:
          "Measures aimed at increasing productive potential, such as education, infrastructure or tax relief on investment, which shift LRAS rightwards.",
        commonError:
          "Describing it as demand management. Supply-side policy changes capacity, so it raises both output and, in the long run, the price level.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.3.1
  "econ-4.3.1": {
    summary:
      "Three markets that move money around the economy and price risk: equity markets through stock exchanges, money markets through short-term lending, and bond markets for longer-term fixed borrowing.",
    keyIdeas: [
      "A stock exchange is a secondary market, where existing shares change hands, with the primary market being the issue of new shares by a company or government.",
      "Money markets trade short-term instruments with a maturity of a year or less: commercial paper, Treasury bills and certificates of deposit.",
      "A bond pays a fixed coupon and repays nominal value at maturity; its yield is the return to the holder and moves inversely with its market price.",
      "Financial markets allocate savings to investment and allow risk to be transferred, but they can also transmit panic.",
    ],
    commonMistakes: [
      "Saying a stock exchange provides finance to firms. Trading in existing shares transfers ownership and raises no new money for the firm.",
      "Claiming bond yield and bond price move together. They move inversely: a fall in market rates raises the price of a fixed-coupon bond.",
      "Confusing the coupon with the yield. The coupon is fixed in cash terms for the bond's life; the yield depends on the price actually paid.",
      "Treating Treasury bills as long-term investments. They are short-term instruments with a maturity of a year or less.",
    ],
    examTip:
      "Bond questions usually test the inverse relationship between yield and price. A useful sentence: a fixed coupon is worth more when interest rates fall, so buyers pay a higher price and the yield falls.",
    terms: [
      {
        term: "Stock exchange",
        definition:
          "An organised market where shares in companies are bought and sold between investors.",
        commonError:
          "Saying it raises finance for the company on the day of a trade. Only a primary issue raises money; a secondary sale pays the seller.",
      },
      {
        term: "Primary market",
        definition:
          "The market in which new securities are issued, such as a company's flotation or a government's sale of Treasury bills.",
        commonError:
          "Confusing it with a stock exchange, which is the secondary market for shares.",
      },
      {
        term: "Secondary market",
        definition:
          "The market in which already-issued securities are traded between investors, which determines their day-to-day prices.",
        commonError:
          "Assuming trading in the secondary market provides finance to the issuer. The funds go to the selling investor.",
      },
      {
        term: "Money market",
        definition:
          "A market for short-term financial instruments with a maturity of a year or less, where borrowers with idle cash meet lenders.",
        commonError:
          "Describing it as the market for currency. It is a market for lending and borrowing over short periods.",
      },
      {
        term: "Commercial paper",
        definition:
          "An unsecured short-term promissory note issued by a large company, usually with a maturity of a few months.",
        commonError:
          "Calling it a government instrument. It carries corporate credit risk, unlike Treasury bills.",
      },
      {
        term: "Treasury bill",
        definition:
          "A short-term government security issued at a discount to face value and redeemed at face value, with a maturity under a year.",
        commonError:
          "Describing it as paying a fixed coupon. Treasury bills pay the return through the difference between the issue price and the redemption price.",
      },
      {
        term: "Certificate of deposit",
        definition:
          "A bank deposit for a fixed term at an agreed rate of interest, traded in the money market before maturity.",
        commonError:
          "Treating it as tradable on the stock exchange. It is a money market instrument, not a share.",
      },
      {
        term: "Bond yield",
        definition:
          "The return to a bond holder, expressed as a percentage of the price paid: the total interest received plus any capital gain or loss to redemption.",
        commonError:
          "Assuming it equals the coupon rate. They are equal only if the bond is bought at nominal value.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.3.2
  "econ-4.3.2": {
    summary:
      "The institution that sets interest rates, why it exists, and how a rate change in a bank reaches a firm's investment decision months later. Monetary policy works through a chain of links, not directly.",
    keyIdeas: [
      "A central bank aims to keep inflation at a target rate, and is given operational independence so decisions are not made for short-term political reasons.",
      "Expansionary monetary policy cuts the base rate, which lowers borrowing costs, raises AD and reduces unemployment; contractionary policy does the reverse.",
      "The transmission mechanism runs: base rate → market interest rates → consumption and investment → AD → output and inflation.",
      "Monetary policy works mainly through borrowing-sensitive sectors, so it is less effective where most spending is out of current income.",
    ],
    commonMistakes: [
      "Saying a base rate cut raises AD because people have more money. The mechanism runs through lower interest rates on borrowing and deposits.",
      "Claiming the base rate applies directly to every loan. Banks set their own rates from the base rate, so the effect is indirect and spread over a period.",
      "Confusing the target with the outcome. A central bank aims at inflation at a target rate; it does not directly set prices or unemployment.",
      "Attributing a rise in AD directly to a bank lending more. The transmission chain has several links, each of which can weaken.",
    ],
    examTip:
      "Transmissions and monetary policy answers should draw the chain and label each link. The evaluation marks come from identifying where the chain can break: weak bank lending, high debt levels, or inflation expectations already anchored.",
    terms: [
      {
        term: "Base rate",
        definition:
          "The interest rate a central bank charges on short-term loans to commercial banks, which anchors market interest rates.",
        commonError:
          "Treating it as the rate every household pays on their mortgage. Banks lend at base rate plus a margin, and pass changes on with a delay.",
      },
      {
        term: "Monetary transmission mechanism",
        definition:
          "The sequence from a change in the base rate to a change in aggregate demand, through market rates, borrowing and spending.",
        commonError:
          "Stopping the chain at the first link and stating that AD rises. Every step has to be justified for the mechanism to hold.",
      },
      {
        term: "Quantitative easing",
        definition:
          "A central bank buying financial assets to increase the money supply and lower long-term interest rates when the base rate has reached its floor.",
        commonError:
          "Describing it as printing banknotes. It expands the central bank's balance sheet and lowers long yields rather than the policy rate.",
      },
      {
        term: "Interest cover ratio",
        definition:
          "The ratio of operating profit to interest payments, used as an indicator of how much headroom a business has to meet its debts.",
        commonError:
          "Ignoring it when evaluating whether a rate cut will actually stimulate borrowing. Firms under financial pressure may borrow more, not less.",
      },
      {
        term: "MPC target",
        definition:
          "A central bank's inflation target, such as 2%, expressed as a rate rather than a price level.",
        commonError:
          "Reading the target as a commitment to a particular price level. A 2% target is compatible with continuously rising prices at that rate.",
      },
      {
        term: "Cumulative effect",
        definition:
          "The total impact of successive policy changes, which is larger than the sum of the individual effects because of the multiplier and expectations.",
        commonError:
          "Assessing each policy change in isolation. Repeated changes compound, and markets often anticipate the next one.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.1.1
  "econ-4.1.1": {
    summary:
      "Why there is an economic problem at all, and the vocabulary used to describe every other topic. Scarcity forces a choice, and every choice costs the next best alternative.",
    keyIdeas: [
      "Scarcity is universal: wants exceed the resources available to satisfy them, so choices must be made.",
      "Opportunity cost is the value of the next best alternative forgone, not the monetary cost.",
      "A positive statement is testable and can be proved or disproved; a normative statement expresses a value judgement.",
    ],
    commonMistakes: [
      "Describing opportunity cost as the money spent, rather than the value of what was given up. A choice costs nothing in money and still has a real cost.",
      "Treating every statement containing the word 'should' as normative. A statement can be normative without that word, and a positive statement can contain value words in a quoted opinion.",
      "Claiming positive statements are always true. Positive means testable, not correct.",
    ],
    examTip:
      "In a 10-mark question, define the term, then apply it to a real example, then evaluate. Definitions alone cap a 10-mark answer at Level 1 or 2; AQA awards the top band for a chain of applied reasoning.",
    terms: [
      {
        term: "Opportunity cost",
        definition:
          "The value of the next best alternative forgone when a choice is made.",
        commonError:
          "Confusing it with the monetary cost of the option chosen. The two are unrelated: a free option still has an opportunity cost, and an expensive one may have a low one.",
        example:
          "A student choosing between a paid part-time job and revising is giving up wages, not paying a fee.",
      },
      {
        term: "Positive statement",
        definition:
          "A statement that can be tested against evidence and shown to be true or false.",
        commonError:
          "Assuming a positive statement must be true. Positivity describes testability, not correctness.",
        example:
          "\"Unemployment in the UK fell in 2023\" is positive. \"Unemployment should be lower\" is not.",
      },
      {
        term: "Normative statement",
        definition:
          "A statement that expresses an opinion about what ought to be, and which cannot be proved or disproved by evidence alone.",
        commonError:
          "Claiming normative statements are useless. They can be evaluated, but against values rather than facts, which is why an examiner wants both sides of a policy argument.",
        example: "\"The government should raise the minimum wage\" is normative.",
      },
      {
        term: "Scarcity",
        definition:
          "The condition in which wants exceed the finite resources available to satisfy them.",
        commonError:
          "Describing scarcity as a shortage. Scarcity is permanent and universal; a shortage is a temporary surplus of demand over supply at a given price.",
      },
      {
        term: "Diminishing marginal utility",
        definition:
          "The principle that the extra satisfaction gained from each additional unit of a good falls as more is consumed.",
        commonError:
          "Saying utility becomes negative. Marginal utility falls towards zero but total utility keeps rising, which is why a rational consumer stops before the point where utility stops increasing at all.",
        example:
          "The first glass of water is worth more than the fourth, even though both add satisfaction.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.1.2
  "econ-4.1.2": {
    summary:
      "How an individual or household chooses, and why the choice made is often not the one a rational-cost model predicts. Covers utility, the marginal rate of substitution, and the biases that make real decisions predictable but not optimal.",
    keyIdeas: [
      "Consumers maximise utility subject to their budget constraint, not total benefit.",
      "The marginal rate of substitution measures how much of one good a consumer will give up for one more unit of another.",
      "Behavioural economics keeps the rational model as a benchmark and isolates specific, nameable departures from it.",
    ],
    commonMistakes: [
      "Attributing every irrational choice to irrationality in general, rather than naming a specific bias. Marks are for the identification.",
      "Confusing the income effect and substitution effect, which move in opposite directions for a normal good when price rises.",
      "Describing prospect theory's certainty effect as a gain in total utility. It is a change in how a choice is weighted, not in the outcome.",
    ],
    examTip:
      "For an evaluate question on behaviour, state the rational prediction first, then the actual behaviour, then name the bias, then say whether it is a rational response to some constraint the model ignored.",
    terms: [
      {
        term: "Utility",
        definition:
          "The satisfaction a consumer derives from consuming a good or service.",
        commonError:
          "Measuring it in money. Utility is ordinal: it can be ranked but not added up or differenced, so \"£5 of utility\" is meaningless.",
      },
      {
        term: "Marginal rate of substitution",
        definition:
          "The amount of one good a consumer is willing to give up for one additional unit of another, at the point of choice.",
        commonError:
          "Describing it as a change in the budget rather than a change in preference. The budget is what constrains the choice; the MRS is what determines the trade-off the consumer is willing to make.",
        example:
          "MRS of AB for AC of 3 means one extra unit of C is worth three units of A in satisfaction terms.",
      },
      {
        term: "Present bias",
        definition:
          "The tendency to weight immediate costs and benefits more heavily than future ones of equal size.",
        commonError:
          "Explaining it as a lack of knowledge. It persists when the learner understands the future consequence perfectly well, so the model has to assume irrational weighting rather than incomplete information.",
        example: "Procrastinating on an exam revision plan that was written down and understood.",
      },
      {
        term: "Confirmation bias",
        definition:
          "The tendency to seek out and give more weight to information that supports an existing belief.",
        commonError:
          "Treating it as deliberate dishonesty. It is a processing tendency that operates regardless of intent.",
      },
      {
        term: "Satisficing",
        definition:
          "Choosing the first option that meets an acceptable standard rather than the option that maximises the outcome.",
        commonError:
          "Confusing it with irrationality. Given limited information and search costs, satisficing can be a rational response to the cost of searching further.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.1.3
  "econ-4.1.3": {
    summary:
      "What makes quantity demanded and quantity supplied change, and why a price rise lowers quantity demanded. The distinction between a movement along a curve and a shift of it is the single most examined idea in this chapter.",
    keyIdeas: [
      "A change in the good's own price causes a movement along a demand or supply curve; a change in any other determinant shifts the curve.",
      "Demand is a derived concept: it exists only because goods must be paid for from limited income.",
      "The law of demand holds because of the income effect, the substitution effect, and for normal goods the fact that having more of something reduces how much each unit is worth.",
    ],
    commonMistakes: [
      "Shifting the demand curve when a change in price is described. This is the most dropped mark in the whole paper.",
      "Listing determinants of demand without applying them to a specific good, which stays in Level 1 or 2.",
      "Conflating a movement along the demand curve with a shift when explaining the effect of a price change on quantity demanded.",
    ],
    examTip:
      "In data-response questions, state whether the change is a movement or a shift, give the effect on equilibrium price and output separately, and say which curve moved and why. Marks are awarded for the chain, not for naming determinants.",
    terms: [
      {
        term: "Movement along the demand curve",
        definition:
          "A change in the quantity demanded caused by a change in the good's own price, with all other determinants held constant.",
        commonError:
          "Describing it as a shift in demand. Terminology is marked: a shift means the whole curve moves because a determinant other than price changed.",
      },
      {
        term: "Shift of the demand curve",
        definition:
          "A change in demand at every price, caused by a determinant other than the good's own price.",
        commonError:
          "Naming the good's own price as a determinant of demand. It is a determinant of quantity demanded, not of demand.",
      },
      {
        term: "Substitute good",
        definition:
          "A good that can be used in place of another, so demand for it moves in the opposite direction to the price of the original.",
        commonError:
          "Giving the wrong direction. As the price of tea rises, demand for coffee rises, because they move in opposite directions.",
      },
      {
        term: "Complementary good",
        definition:
          "A good consumed alongside another, so demand for it moves in the same direction as the price of the original.",
        commonError:
          "Describing complements as a pair that substitutes for each other. Complements are consumed together, substitutes replace each other.",
        example: "Cars and petrol; printers and ink cartridges.",
      },
      {
        term: "Determinant of demand",
        definition:
          "A factor other than the good's own price that changes the quantity demanded at every price.",
        commonError:
          "Listing the good's own price among the determinants of demand.",
      },
      {
        term: "Determinant of supply",
        definition:
          "A factor other than the good's own price that changes the quantity supplied at every price.",
        commonError:
          "Saying a fall in the price of an input shifts the demand curve. It shifts supply, because it changes firms' costs.",
      },
    ],
  },

  // ------------------------------------------------ AQA Economics 4.1.6
  "econ-4.1.6": {
    summary:
      "Why a market can settle at an outcome that leaves value uncreated or harm uncompensated, and what can be done about it. Efficiency, externality, public goods, asymmetric information, and the limits of intervention all appear here.",
    keyIdeas: [
      "Allocative efficiency is reached when the price consumers pay reflects the true social cost of the good, so no one can be made better off without someone being worse off.",
      "Externalities are costs or benefits borne by third parties, which the price does not reflect.",
      "Public goods are non-rivalrous and non-excludable, which produces the free-rider problem and means private markets underprovide them.",
    ],
    commonMistakes: [
      "Claiming market failure means there is no market. It means the market outcome is not efficient, not that markets are the wrong mechanism in every respect.",
      "Confusing a positive externality with a public good. A positive externality is a benefit to a third party; a public good is defined by being non-rivalrous and non-excludable.",
      "Proposing a subsidy for a negative externality. A negative externality is corrected with a tax, because the market overproduces.",
      "Ignoring second-best theory: a tax that corrects one distortion can worsen another, so a perfectly corrective tax is not always optimal.",
    ],
    examTip:
      "For a 25 or 30-mark question, take one market failure, establish it, apply the correction with a diagram, then evaluate using second-best theory or transaction costs. Diagrams must show the welfare loss, not just the shift.",
    terms: [
      {
        term: "Externality",
        definition:
          "A cost or benefit arising from an economic activity that falls on a third party rather than on the participants in the transaction.",
        commonError:
          "Describing any effect on other people as an externality. An effect counts only if it is not reflected in the price.",
      },
      {
        term: "Negative externality",
        definition:
          "A cost imposed on third parties by a transaction, not reflected in its price, so the market overproduces the good.",
        commonError:
          "Saying it should be subsidised. A subsidy increases output further, in the wrong direction.",
        example: "Factory pollution imposing respiratory illness on nearby residents.",
      },
      {
        term: "Positive externality",
        definition:
          "A benefit conferred on third parties by a transaction, not reflected in its price, so the market underprovides the good.",
        commonError:
          "Describing education as a public good rather than as a positive externality. It is excludable, so it is not a public good.",
        example: "Vaccination reducing disease among people the vaccinated person never meets.",
      },
      {
        term: "Public good",
        definition:
          "A good that is non-rivalrous, so one person's consumption does not reduce another's, and non-excludable, so people cannot be prevented from consuming it without paying.",
        commonError:
          "Calling a club good a public good. A club good is excludable by location or subscription, so it does not suffer the free-rider problem to the same degree.",
      },
      {
        term: "Free-rider problem",
        definition:
          "The tendency for consumers of a non-excludable good to wait for others to pay, so no one volunteers and the good is underprovided.",
        commonError:
          "Suggesting the problem is that people cannot be excluded. Exclusion is impossible; the problem is that non-payers still benefit, so individual incentives do not support collective provision.",
      },
      {
        term: "Allocative efficiency",
        definition:
          "A situation in which no further reallocation can make anyone better off without making someone else worse off.",
        commonError:
          "Confusing it with dynamic or productive efficiency, which are about firms' costs rather than about the allocation of resources between uses.",
      },
      {
        term: "Asymmetric information",
        definition:
          "A situation in which one party to a transaction knows more than the other, so the market price cannot reflect quality.",
        commonError:
          "Treating it as a form of externality. It is a failure of knowledge in the market, and it is corrected by signalling, screening or regulation rather than by a Pigouvian tax.",
        example: "Used cars: the seller knows the car's history and the buyer does not.",
      },
    ],
  },
};
