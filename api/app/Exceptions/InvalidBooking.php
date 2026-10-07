<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

/**
 * A booking that could never be valid, as opposed to one whose slot was taken
 * (BookingConflict, 409). The code is machine-readable so the client can say
 * which rule was broken without parsing a message.
 */
class InvalidBooking extends Exception
{
    public function __construct(public readonly string $reason, string $message = 'Invalid booking.')
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => $this->reason, 'message' => $this->getMessage()], 422);
    }
}
