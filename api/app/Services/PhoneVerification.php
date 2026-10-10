<?php

namespace App\Services;

use App\Channels\MessageChannel;
use App\Models\Customer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * A four-digit code sent to a phone, and the token that proves it was entered.
 *
 * The token is what the booking page keeps on the device, so a returning
 * customer books without a code — but it is the server that checks it now,
 * not the page. Without this, a phone number was an identity anyone could
 * claim: book in a stranger's name, join the waitlist with their number, or
 * link an account to their customer record.
 */
class PhoneVerification
{
    private const CODE_TTL_MINUTES = 10;
    private const MAX_ATTEMPTS = 5;
    private const RESEND_SECONDS = 30;
    private const MAX_PER_HOUR = 5;
    public const TOKEN_TTL_DAYS = 90;

    public function __construct(private MessageChannel $channel)
    {
    }

    /**
     * Sends a fresh code.
     *
     * @return array{code: ?string, error: ?string} the code itself (for the
     *   demo's on-screen echo), or why none was sent: too_soon / too_many.
     */
    public function send(string $org, string $phone, string $business): array
    {
        $digits = Customer::normalisePhone($phone);
        $recent = DB::table('phone_verifications')
            ->where('org_id', $org)->where('phone_digits', $digits)
            ->where('created_at', '>', now()->subHour())
            ->orderByDesc('created_at')->pluck('created_at');

        if ($recent->count() >= self::MAX_PER_HOUR) {
            return ['code' => null, 'error' => 'too_many'];
        }
        if ($recent->isNotEmpty() && Carbon::parse($recent->first())->gt(now()->subSeconds(self::RESEND_SECONDS))) {
            return ['code' => null, 'error' => 'too_soon'];
        }

        $code = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        DB::table('phone_verifications')->insert([
            'id' => (string) Str::uuid(),
            'org_id' => $org,
            'phone_digits' => $digits,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(self::CODE_TTL_MINUTES),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->channel->send(trim($phone), "رمز التحقق في {$business}: {$code}\nلا تشارك هذا الرمز مع أحد.");

        return ['code' => $code, 'error' => null];
    }

    /** The code entered: a token when it is right, null when it is not (or no longer can be). */
    public function verify(string $org, string $phone, string $code): ?string
    {
        $row = DB::table('phone_verifications')
            ->where('org_id', $org)->where('phone_digits', Customer::normalisePhone($phone))
            ->whereNull('verified_at')->where('expires_at', '>', now())
            ->orderByDesc('created_at')->first();

        if (! $row || $row->attempts >= self::MAX_ATTEMPTS) {
            return null;
        }
        if (! Hash::check($code, $row->code_hash)) {
            DB::table('phone_verifications')->where('id', $row->id)->increment('attempts');

            return null;
        }

        $token = Str::random(40);
        DB::table('phone_verifications')->where('id', $row->id)->update([
            'token_hash' => hash('sha256', $token),
            'verified_at' => now(),
            'updated_at' => now(),
        ]);

        return $token;
    }

    /** Whether this token proves this phone, for this business. */
    public function holds(string $org, string $phone, ?string $token): bool
    {
        if (! $token) {
            return false;
        }

        return DB::table('phone_verifications')
            ->where('org_id', $org)
            ->where('phone_digits', Customer::normalisePhone($phone))
            ->where('token_hash', hash('sha256', $token))
            ->where('verified_at', '>', now()->subDays(self::TOKEN_TTL_DAYS))
            ->exists();
    }
}
