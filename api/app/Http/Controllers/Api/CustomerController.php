<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public static function toDomain(Customer $c): array
    {
        return [
            'id' => $c->id,
            'name' => $c->name,
            'phone' => $c->phone,
            'email' => $c->email,
            'notes' => $c->notes,
            'createdAt' => $c->created_at?->toIso8601String(),
        ];
    }

    /**
     * `customers_read`, in PHP: operators see the organization's directory, a
     * signed-in customer sees only their own record, and a guest sees nothing.
     *
     * Never readable by an anonymous caller, which is the point — the guest
     * booking path writes through the public endpoint instead, so this table
     * stays closed to it.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        if ($user?->isOperator()) {
            $rows = Customer::where('org_id', $this->orgId($request))
                ->orderBy('created_at')->get();
        } elseif ($user) {
            $rows = Customer::where('user_id', $user->id)->orderBy('created_at')->get();
        } else {
            return response()->json([]);
        }

        return response()->json($rows->map(fn (Customer $c) => self::toDomain($c))->all());
    }

    public function bulkUpdate(Request $request)
    {
        $data = $request->validate([
            'customers' => ['required', 'array'],
            'customers.*.id' => ['required', 'string'],
            'customers.*.name' => ['required', 'string', 'max:255'],
            'customers.*.phone' => ['required', 'string', 'max:64'],
            'customers.*.email' => ['nullable', 'email', 'max:255'],
            'customers.*.notes' => ['nullable', 'string'],
        ]);

        $org = $this->orgId($request);

        DB::transaction(function () use ($data, $org) {
            foreach ($data['customers'] as $row) {
                $this->assertNotForeign(Customer::class, $row['id'], $org);
                // updateOrCreate on the id, not the phone: the unique index on
                // (org_id, phone_digits) is what dedupes, and letting it raise
                // is better than racing it with a lookup.
                Customer::updateOrCreate(
                    ['id' => $row['id']],
                    [
                        'org_id' => $org,
                        'name' => trim($row['name']),
                        'phone' => trim($row['phone']),
                        'email' => $row['email'] ?? null,
                        'notes' => $row['notes'] ?? null,
                    ]
                );
            }
        });

        return response()->noContent();
    }
}
