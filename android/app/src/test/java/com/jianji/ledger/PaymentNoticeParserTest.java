package com.jianji.ledger;

import org.junit.Test;
import static org.junit.Assert.*;

public class PaymentNoticeParserTest {
    @Test public void recognizesOutgoingPaymentsFromKnownApps() {
        PaymentNoticeParser.Result wechat = PaymentNoticeParser.parse("com.tencent.mm", "微信支付", "微信支付成功 ¥12.30");
        assertNotNull(wechat);
        assertEquals("微信", wechat.source);
        assertEquals(1230, wechat.cents);
        PaymentNoticeParser.Result alipay = PaymentNoticeParser.parse("com.eg.android.AlipayGphone", "支付宝", "你已付款 25元");
        assertNotNull(alipay);
        assertEquals(2500, alipay.cents);
        PaymentNoticeParser.Result large = PaymentNoticeParser.parse("com.eg.android.AlipayGphone", "付款成功", "向收款方支付成功 ¥1,234.56");
        assertNotNull(large);
        assertEquals(123456, large.cents);
    }

    @Test public void ignoresIncomingAmbiguousOrUntrustedNotifications() {
        assertNull(PaymentNoticeParser.parse("com.example.fake", "支付宝", "支付成功 ¥12.30"));
        assertNull(PaymentNoticeParser.parse("com.tencent.mm", "微信支付", "退款到账 ¥12.30，原订单支付成功"));
        assertNull(PaymentNoticeParser.parse("com.tencent.mm", "微信支付", "待支付 ¥12.30"));
        assertNull(PaymentNoticeParser.parse("com.tencent.mm", "微信支付", "付款成功，查看详情"));
        assertNull(PaymentNoticeParser.parse("com.tencent.mm", "付款成功", "实付 ¥80.00，优惠 ¥20.00"));
    }
}
