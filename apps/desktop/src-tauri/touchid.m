#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>

int main(int argc, char *argv[]) {
    @autoreleasepool {
        LAContext *context = [[LAContext alloc] init];
        NSError *error = nil;

        // Check if biometrics (Touch ID / Apple Watch) is available
        if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
            if (argc > 1 && strcmp(argv[1], "--check") == 0) {
                printf("UNAVAILABLE\n");
                return 1;
            }
            // Fallback to device owner authentication (Touch ID or macOS Password)
            if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&error]) {
                printf("UNAVAILABLE\n");
                return 1;
            }
        }

        if (argc > 1 && strcmp(argv[1], "--check") == 0) {
            printf("AVAILABLE\n");
            return 0;
        }

        NSString *reason = @"Unlock LocalVault with Touch ID";
        if (argc > 1 && argv[1][0] != '-') {
            reason = [NSString stringWithUTF8String:argv[1]];
        }

        dispatch_semaphore_t sema = dispatch_semaphore_create(0);
        __block BOOL authSuccess = NO;
        __block NSString *errMsg = nil;

        [context evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
                localizedReason:reason
                          reply:^(BOOL success, NSError * _Nullable evalError) {
            authSuccess = success;
            if (evalError) {
                errMsg = [evalError localizedDescription];
            }
            dispatch_semaphore_signal(sema);
        }];

        dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);

        if (authSuccess) {
            printf("SUCCESS\n");
            return 0;
        } else {
            const char *cErr = errMsg ? [errMsg UTF8String] : "Biometric verification failed or cancelled";
            fprintf(stderr, "%s\n", cErr);
            return 2;
        }
    }
}
