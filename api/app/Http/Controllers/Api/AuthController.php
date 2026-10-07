<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        // One message and one code for both "no such address" and "wrong
        // password". Distinguishing them turns the login form into an oracle
        // for which addresses have accounts here.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        // Every sign-in mints a fresh token and the client stores only that.
        // Nothing about the role travels with it: /auth/me re-reads the row,
        // so revoking operator access takes effect on the next request rather
        // than whenever the client happens to sign in again.
        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $user->toSession(),
        ]);
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'fullName' => ['required', 'string', 'min:2', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
        ]);

        // A new account is a customer. `role` is not in $fillable and is not
        // set here: operator access is granted server-side, never claimed at
        // sign-up, so there is no request this endpoint could receive that
        // would produce one.
        $user = new User();
        $user->fill([
            'name' => $data['fullName'],
            'email' => $data['email'],
            'password' => $data['password'],
        ]);
        $user->org_id = Organization::query()->value('id');
        $user->save();

        $this->linkCustomer($user, $data['phone'] ?? null);

        // No token in the response, deliberately: registering creates the
        // account and nothing else, so signing in stays one explicit step.
        return response()->json(['user' => $user->toSession()], 201);
    }

    /**
     * Links that would collide with the app's own routes or read as official.
     * A business slug becomes /b/{slug}, but it is also the name customers
     * see, so the platform's own words are kept for the platform.
     */
    private const RESERVED_SLUGS = [
        'admin', 'api', 'app', 'b', 'book', 'booking', 'login', 'register', 'www',
        'waeda', 'support', 'help', 'settings', 'dashboard', 'demo',
    ];

    private const SLUG_RULE = 'regex:/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/';

    /** "Is waeda.app/b/lamsa still free?" — asked while the owner types. */
    public function slugAvailable(Request $request)
    {
        $slug = strtolower((string) $request->query('slug', ''));
        $valid = preg_match('/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/', $slug) === 1;

        return response()->json([
            'slug' => $slug,
            'available' => $valid
                && ! in_array($slug, self::RESERVED_SLUGS, true)
                && ! Organization::where('slug', $slug)->exists(),
        ]);
    }

    /**
     * Open a business: the owner's account, the business, and a booking page
     * that works the moment this returns.
     *
     * One transaction, because half a business is worse than none — an owner
     * whose services saved but whose hours did not has a page that offers no
     * times and no way to tell why. The owner is the operator of the business
     * they just created; that is the one case where the server sets the role,
     * and it can only ever grant it over a brand-new, empty organization.
     */
    public function registerBusiness(Request $request)
    {
        $data = $request->validate([
            'fullName' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'business.name' => ['required', 'string', 'min:2', 'max:255'],
            'business.slug' => ['required', 'string', self::SLUG_RULE, 'unique:organizations,slug'],
            'business.category' => ['nullable', 'string', 'max:64'],
            'business.address' => ['nullable', 'string', 'max:255'],
            'staff' => ['required', 'array', 'min:1', 'max:20'],
            'staff.*.name' => ['required', 'string', 'min:2', 'max:255'],
            'staff.*.role' => ['nullable', 'string', 'max:120'],
            'services' => ['required', 'array', 'min:1', 'max:30'],
            'services.*.name' => ['required', 'string', 'min:2', 'max:255'],
            'services.*.category' => ['nullable', 'string', 'max:64'],
            'services.*.durationMin' => ['required', 'integer', 'between:5,600'],
            'services.*.priceMinor' => ['required', 'integer', 'min:0'],
            'services.*.iconKey' => ['nullable', 'string', 'max:64'],
            'hours' => ['required', 'array', 'size:7'],
            'hours.*.weekday' => ['required', 'integer', 'between:0,6', 'distinct'],
            'hours.*.open' => ['required', 'date_format:H:i'],
            'hours.*.close' => ['required', 'date_format:H:i'],
            'hours.*.isClosed' => ['required', 'boolean'],
        ]);

        $slug = strtolower($data['business']['slug']);
        if (in_array($slug, self::RESERVED_SLUGS, true)) {
            throw ValidationException::withMessages(['business.slug' => ['reserved']]);
        }

        $user = DB::transaction(function () use ($data, $slug) {
            $org = Organization::create([
                'name' => $data['business']['name'],
                'slug' => $slug,
                'category' => $data['business']['category'] ?? null,
                'address' => $data['business']['address'] ?? null,
                'timezone' => 'Asia/Riyadh',
                'currency' => 'SAR',
            ]);

            $user = new User();
            $user->fill([
                'name' => $data['fullName'],
                'email' => $data['email'],
                'password' => $data['password'],
            ]);
            $user->org_id = $org->id;
            $user->role = 'operator';
            $user->save();

            $staff = collect($data['staff'])->values()->map(fn ($m, $i) => Resource::create([
                'id' => (string) Str::uuid(),
                'org_id' => $org->id,
                'name' => $m['name'],
                'role' => $m['role'] ?? null,
                'is_active' => true,
                'sort_order' => $i,
            ]));

            // Everyone can do everything to begin with; Settings narrows it.
            foreach (array_values($data['services']) as $i => $s) {
                $service = Service::create([
                    'id' => (string) Str::uuid(),
                    'org_id' => $org->id,
                    'name' => $s['name'],
                    'category' => $s['category'] ?? null,
                    'description' => '',
                    'duration_min' => $s['durationMin'],
                    'buffer_min' => 10,
                    'price_minor' => $s['priceMinor'],
                    'icon_key' => $s['iconKey'] ?? 'Sparkles',
                    'is_active' => true,
                    'sort_order' => $i,
                ]);
                $service->resources()->sync($staff->pluck('id')->all());
            }

            foreach ($data['hours'] as $h) {
                DB::table('business_hours')->insert([
                    'org_id' => $org->id,
                    'weekday' => $h['weekday'],
                    'open_time' => $h['open'],
                    'close_time' => $h['close'],
                    'is_closed' => $h['isClosed'],
                ]);
            }

            return $user;
        });

        // Unlike a customer sign-up, the owner goes straight to their console:
        // the next thing they want is to see the page they just made.
        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $user->toSession(),
        ], 201);
    }

    /**
     * Point the account at its customer record.
     *
     * Nothing ever set customers.user_id, so a signed-in customer — who is
     * scoped to "bookings whose customer is me" — always saw an empty list,
     * including the bookings they had made as a guest. The phone is the
     * identity the booking form already uses; the email is the fallback.
     */
    private function linkCustomer(User $user, ?string $phone): void
    {
        $digits = Customer::normalisePhone($phone);
        $record = Customer::where('org_id', $user->org_id)->whereNull('user_id')
            ->where(fn ($q) => $q
                ->when(strlen($digits) >= 9, fn ($q) => $q->where('phone_digits', $digits))
                ->orWhere('email', $user->email))
            ->first();

        if ($record) {
            $record->update(['user_id' => $user->id]);
        } elseif (strlen($digits) >= 9) {
            Customer::create([
                'org_id' => $user->org_id,
                'user_id' => $user->id,
                'name' => $user->name,
                'phone' => trim($phone),
                'email' => $user->email,
            ]);
        }
    }

    public function me(Request $request)
    {
        return response()->json(['user' => $request->user()->toSession()]);
    }

    public function logout(Request $request)
    {
        // This token only. Signing out of a laptop should not sign you out of
        // a phone.
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
