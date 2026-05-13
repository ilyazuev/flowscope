-- noinspection SqlResolveForFile
WITH
    params AS (
        select params_name, currency_cd, dt_from, dt_to from (
             SELECT
                 params_name,
                 currency_cd,
                 dt_from,
                 dt_to
             FROM LINEAGE_TEST_PARAMS -- test parameter in comment :order_id
         ) /* test parameter in comment :order_id */
        where
            1 = 1
          and params_name = :params_name -- DEFAULT_PARAMS
    ),
    ord AS (
        SELECT
            o.order_id,
            o.order_no,
            o.customer_id,
            o.order_dt,
            o.status_cd,
            o.currency_cd,
            p.params_name,
            o.BILLING_NAME, o.BILLING_STREET1, o.BILLING_CITY, o.BILLING_POSTAL_CODE, o.BILLING_COUNTRY_CD, o.SHIPPING_NAME, o.SHIPPING_STREET1, o.SHIPPING_STREET2, o.SHIPPING_CITY, o.SHIPPING_POSTAL_CODE, o.SHIPPING_COUNTRY_CD, o.PAYMENT_METHOD, o.PAYMENT_TXN_ID, o.PAID_AT, o.SHIPPING_METHOD, o.TRACKING_NO, o.SHIPPED_AT, o.DELIVERED_AT, o.SUBTOTAL_AMT, o.TAX_AMT, o.SHIPPING_COST, o.TOTAL_DISCOUNT_AMT, o.TOTAL_AMT, o.CHANNEL_CD, o.COUPON_CD, o.CREATED_AT, o.UPDATED_AT
        FROM LINEAGE_TEST_ORDER o
                 CROSS JOIN params p
        WHERE o.order_dt >= p.dt_from
          AND o.order_dt <  p.dt_to
          AND o.status_cd IN ('PAID','SHIPPED')
    ),
    items AS (
        SELECT
            oi.order_id,
            oi.product_id,
            oi.qty,
            oi.unit_price,
            oi.discount_amt,
            (oi.qty * oi.unit_price - oi.discount_amt) AS line_amount,
            p.params_name,
            o.BILLING_NAME, o.BILLING_STREET1, o.BILLING_CITY, o.BILLING_POSTAL_CODE, o.BILLING_COUNTRY_CD, o.SHIPPING_NAME, o.SHIPPING_STREET1, o.SHIPPING_STREET2, o.SHIPPING_CITY, o.SHIPPING_POSTAL_CODE, o.SHIPPING_COUNTRY_CD, o.PAYMENT_METHOD, o.PAYMENT_TXN_ID, o.PAID_AT, o.SHIPPING_METHOD, o.TRACKING_NO, o.SHIPPED_AT, o.DELIVERED_AT, o.SUBTOTAL_AMT, o.TAX_AMT, o.SHIPPING_COST, o.TOTAL_DISCOUNT_AMT, o.TOTAL_AMT, o.CHANNEL_CD, o.COUPON_CD, o.CREATED_AT, o.UPDATED_AT
        FROM LINEAGE_TEST_ORDER_ITEM oi
                 JOIN ord o ON o.order_id = oi.order_id
                 LEFT JOIN params p ON p.currency_cd = o.currency_cd -- check 2 CTE joins
    ),
    enriched AS (
        SELECT
            c.customer_id,
            c.customer_no,
            c.full_name,
            o.order_id,
            o.order_no,
            o.order_dt,
            p.product_id,
            p.sku,
            p.category,
            i.qty,
            i.line_amount,
            tbl_ord.status_cd
        FROM ord o
                 JOIN LINEAGE_TEST_CUSTOMER c ON c.customer_id = o.customer_id
                 LEFT JOIN LINEAGE_TEST_ORDER tbl_ord ON tbl_ord.customer_id = c.customer_id -- test double table join
                 JOIN items i ON i.order_id = o.order_id
                 JOIN LINEAGE_TEST_PRODUCT_V p ON p.product_id = i.product_id
        WHERE
            1 = 1
          and c.customer_no = :customer_no -- CUST-023
          and p.category = :category -- ELECTRONICS
          and c.customer_no = :customer_no
    ),
    cat_rank AS (
        SELECT
            customer_id,
            category,
            SUM(line_amount) AS cat_amount,
            ROW_NUMBER() OVER (
                PARTITION BY customer_id
                ORDER BY SUM(line_amount) DESC, category
                ) AS rn
        FROM enriched
        GROUP BY customer_id, category
    )
SELECT
    e.customer_no,
    e.full_name,
    COUNT(DISTINCT e.order_id) AS orders_cnt,
    COUNT(*) AS lines_cnt,
    SUM(e.line_amount) AS revenue_amt,
    MAX(CASE WHEN cr.rn = 1 THEN cr.category END) AS top_category
FROM enriched e
         LEFT JOIN cat_rank cr
                   ON cr.customer_id = e.customer_id
WHERE
    1 = 1
  and e.full_name = :full_name -- Alice Heikkinen
GROUP BY
    e.customer_no,
    e.full_name
ORDER BY
    revenue_amt DESC;