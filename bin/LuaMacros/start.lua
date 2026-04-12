clear()
local key_file_path = "C:/Users/aldai/AppData/Roaming/macropad-studio/pressed_key.txt"
lmc_device_set_name('MACROS', [[18B01A70]])
print("Auto-connected to saved Macropad!")

                lmc.minimizeToTray = true
                lmc_minimize() 
                lmc_set_handler('MACROS', function(button, direction)
                    if (direction == 1) then return end
                    local f = io.open(key_file_path, 'w')
                    if f then
                        f:write(button)
                        f:close()
                        lmc_send_keys('{F24}')
                    end
                end)
                