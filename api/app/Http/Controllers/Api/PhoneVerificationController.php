<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Organization;
use App\Services\PhoneVerification;
use Illuminate\Http\Request;

/** The code step of the booking page and the waitlist: send a code, check it. */
class PhoneVerificationController extends Controller
{
    public function __construct(private PhoneVerification $verification)
    {
    }

    public function send(Request $request)
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:64']]);
        if (strlen(Customer::normalisePhone($data['phone'])) < 9) {
            return response()->json(['error' => 'invalid_phone'], 422);
        }
        $org = $this->publicOrgId($request);

        $sent = $this->verification->send($org, $data['phone'], Organization::whereKey($org)->value('name') ?? 'وعدة');
        if ($sent['error']) {
            return response()->json(['error' => $sent['error']], 429);
        }

        // Until a real channel is connected the code goes nowhere a customer
        // can read it, so the page shows it instead — only then, and only
        // because config says so. With WhatsApp connected this is off.
        return response()->json(
            ['sent' => true] + (config('guard.otp_echo') ? ['devCode' => $sent['code']] : []),
        );
    }

    public function verify(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:64'],
            'code' => ['required', 'string', 'size:4'],
        ]);

        $token = $this->verification->verify($this->publicOrgId($request), $data['phone'], $data['code']);

        return $token
            ? response()->json(['token' => $token])
            : response()->json(['error' => 'invalid_code'], 422);
    }
}
