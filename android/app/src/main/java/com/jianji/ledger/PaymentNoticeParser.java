package com.jianji.ledger;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PaymentNoticeParser {
    static final class Result {
        final String source;
        final long cents;
        Result(String source, long cents) { this.source = source; this.cents = cents; }
    }

    private static final Pattern PAYMENT = Pattern.compile("支付成功|付款成功|成功支付|已付款|扣款成功|消费成功|成功付款|支付了|付款了|已支付");
    private static final Pattern INCOMING = Pattern.compile("退款|退回|收款成功|收钱到账|到账通知|入账|转入|红包|提现|充值|待支付|未支付|支付失败|付款失败");
    private static final Pattern AMOUNT = Pattern.compile("(?:[¥￥]\\s*((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,8})(?:\\.[0-9]{1,2})?)|((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,8})(?:\\.[0-9]{1,2})?)\\s*元)");

    static Result parse(String packageName, String title, String body) {
        String source;
        if ("com.tencent.mm".equals(packageName)) source = "微信";
        else if ("com.eg.android.AlipayGphone".equals(packageName)) source = "支付宝";
        else return null;
        String content = (title == null ? "" : title) + " " + (body == null ? "" : body);
        if (!PAYMENT.matcher(content).find() || INCOMING.matcher(content).find()) return null;
        Matcher match = AMOUNT.matcher(content);
        if (!match.find()) return null;
        try {
            BigDecimal amount = new BigDecimal((match.group(1) == null ? match.group(2) : match.group(1)).replace(",", ""));
            long cents = amount.movePointRight(2).longValueExact();
            while (match.find()) {
                long another = new BigDecimal((match.group(1) == null ? match.group(2) : match.group(1)).replace(",", "")).movePointRight(2).longValueExact();
                if (another != cents) return null;
            }
            return cents > 0 ? new Result(source, cents) : null;
        } catch (ArithmeticException | NumberFormatException error) { return null; }
    }
}
